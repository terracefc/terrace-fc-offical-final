"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft, CheckCircle2, Loader2, Navigation, PackageCheck, Truck } from "lucide-react"
import { getOrderDisplayId, isCancelledOrderExpired, type StoreOrder } from "@/lib/orders"
import { formatExpectedDelivery, getOrderStatusLabel, getTrackingSubPhases, ORDER_STATUS_STEPS } from "@/lib/tracking"

type ShiprocketTracking = {
  awb: string
  status: string
  courierName: string
  estimatedDelivery: string
  deliveredAt: string
  latitude: number | null
  longitude: number | null
  scans: Array<{ status: string; location: string; date: string }>
}

export default function OrderTrackingPage() {
  const params = useParams()
  const orderId = String(params.orderId || "")
  const [order, setOrder] = useState<StoreOrder | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")
  const [now, setNow] = useState(Date.now())
  const [tracking, setTracking] = useState<ShiprocketTracking | null>(null)

  useEffect(() => {
    if (!orderId) return

    loadLiveOrder(orderId)
      .then(({ order, tracking }) => {
        setOrder(order)
        setTracking(tracking)
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Order not found."))
      .finally(() => setIsLoading(false))
  }, [orderId])

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!orderId) return
    const interval = window.setInterval(() => {
      loadLiveOrder(orderId)
        .then(({ order, tracking }) => {
          setOrder(order)
          setTracking(tracking)
        })
        .catch(() => null)
    }, 15_000)
    return () => window.clearInterval(interval)
  }, [orderId])

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="flex items-center gap-3 text-sm font-bold text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading order...
        </div>
      </main>
    )
  }

  const orderExpired = order ? isCancelledOrderExpired(order, now) : false

  if (error || !order || orderExpired) {
    return (
      <main className="min-h-screen bg-background px-4 py-12 text-foreground">
        <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-background/85 p-6 shadow-sm">
          <Link href="/profile" className="mb-6 inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-accent">
            <ArrowLeft className="h-4 w-4" />
            Back to Profile
          </Link>
          <h1 className="text-3xl font-black tracking-tight">Order not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error || "This cancelled order is no longer visible."}</p>
        </div>
      </main>
    )
  }

  const currentStatus = order.fulfillmentStatus === "processing" ? "confirmed" : order.fulfillmentStatus || "confirmed"
  const currentIndex = ORDER_STATUS_STEPS.indexOf(currentStatus as any)
  const completedIndex = currentStatus === "cancelled" || currentStatus === "failed_to_ship" ? -1 : Math.max(0, currentIndex)
  const hasCourierMapLocation = Number.isFinite(tracking?.latitude) && Number.isFinite(tracking?.longitude)
  const canShowCourierMap = hasCourierMapLocation && ["out_for_delivery", "delivered"].includes(currentStatus)
  const scanEvents = tracking?.scans || order.delhiveryScans || []
  const currentSubPhases = getTrackingSubPhases(currentStatus, scanEvents, tracking?.status || order.delhiveryStatus || order.shiprocketStatus)

  return (
    <main className="min-h-screen bg-secondary/20 px-4 py-8 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/profile" className="mb-8 inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-accent">
          <ArrowLeft className="h-4 w-4" />
          Back to Profile
        </Link>

        <section className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
          <div className="border-b border-border p-5 sm:p-6">
          <p className="text-xs font-black uppercase tracking-widest text-accent">Live Shipment Tracking</p>
          <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{getOrderDisplayId(order)}</h1>
              <p className="mt-1 text-sm text-muted-foreground">Placed {new Date(order.createdAt).toLocaleString("en-IN")}</p>
            </div>
            <span className="w-fit rounded-full bg-accent/10 px-3 py-1 text-xs font-black uppercase tracking-widest text-accent">
              {getOrderStatusLabel(currentStatus)}
            </span>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <InfoBox label="AWB" value={tracking?.awb || order.trackingNumber || order.shippingId || "Not available yet"} />
            <InfoBox label="Courier" value={tracking?.courierName || order.courierName || "Not assigned yet"} />
            <InfoBox label="Expected Delivery" value={formatExpectedDelivery(tracking?.estimatedDelivery || order.estimatedDelivery)} />
          </div>
          </div>
          {canShowCourierMap && (
          <div className="relative h-[300px] bg-secondary sm:h-[390px]">
              <iframe
                title="Latest courier location"
                src={`https://maps.google.com/maps?q=${tracking?.latitude},${tracking?.longitude}&z=15&output=embed`}
                className="h-full w-full border-0"
                loading="lazy"
              />
            <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-lg border border-border bg-background/95 px-3 py-2 text-xs font-black shadow-lg">
              <Navigation className="h-4 w-4 text-accent" />
              Latest courier location
            </div>
          </div>
          )}
        </section>

        <section className="mt-5 rounded-xl border border-border bg-background p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Current Status</p>
              <h2 className="mt-1 text-xl font-black tracking-tight">{getOrderStatusLabel(currentStatus)}</h2>
            </div>
            <p className="text-xs font-bold text-muted-foreground">Updates automatically</p>
          </div>
          {currentStatus === "failed_to_ship" && (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-600">
              The courier could not complete delivery. Open the secure link sent to your email to confirm the address and arrange re-shipping.
            </div>
          )}
          {currentSubPhases.length > 0 && (
            <div className="mt-4 rounded-xl border border-accent/20 bg-accent/5 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-accent">Sub Phase</p>
              <div className="mt-3 space-y-3">
                {currentSubPhases.map((event, index) => (
                  <div key={`${event.status}-${event.date}-${index}`} className="border-l-2 border-accent/40 pl-3">
                    <p className="text-sm font-black">{event.status || getOrderStatusLabel(currentStatus)}</p>
                    {event.location && <p className="mt-1 text-xs text-muted-foreground">{event.location}</p>}
                    {event.date && <p className="mt-1 text-[11px] font-bold text-muted-foreground">{formatTrackingDate(event.date)}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="mt-6 space-y-0">
            {ORDER_STATUS_STEPS.map((status, index) => {
              const done = index <= completedIndex
              const active = status === currentStatus
              return (
                <div key={status} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full border ${done ? "border-accent bg-accent text-accent-foreground" : "border-border bg-secondary text-muted-foreground"}`}>
                      {String(status).includes("delivered") ? <CheckCircle2 className="h-4 w-4" /> : String(status).includes("ship") ? <Truck className="h-4 w-4" /> : <PackageCheck className="h-4 w-4" />}
                    </div>
                    {index < ORDER_STATUS_STEPS.length - 1 && <div className="h-full min-h-10 w-px bg-border" />}
                  </div>
                  <div className="min-w-0 flex-1 pb-5">
                    <p className={`font-black ${active ? "text-accent" : ""}`}>{getOrderStatusLabel(status)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{index <= completedIndex ? "Shipment update received" : "Pending"}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </main>
  )
}

async function loadLiveOrder(orderId: string) {
  const [orderResponse, trackingResponse] = await Promise.all([
      fetch(`/api/orders/${encodeURIComponent(orderId)}`),
      fetch(`/api/shiprocket/tracking/${encodeURIComponent(orderId)}`),
  ])
  const orderData = await orderResponse.json().catch(() => null)
  const trackingData = await trackingResponse.json().catch(() => null)
  if (!orderResponse.ok) throw new Error(orderData?.error || "Order not found.")
  return {
    order: orderData.order as StoreOrder,
    tracking: trackingData?.tracking || null,
  }
}

function formatTrackingDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/20 p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm font-black">{value}</p>
    </div>
  )
}

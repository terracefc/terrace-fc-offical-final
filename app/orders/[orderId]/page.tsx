"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft, CheckCircle2, ChevronDown, ChevronUp, Loader2, Navigation, PackageCheck, Truck } from "lucide-react"
import { getOrderDisplayId, isCancelledOrderExpired, type StoreOrder } from "@/lib/orders"
import { formatExpectedDelivery, getLiveFulfillmentStatus, getOrderStatusLabel, getTrackingSubPhases, ORDER_STATUS_STEPS } from "@/lib/tracking"

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
  const [phoneLast4, setPhoneLast4] = useState("")
  const [isPhoneVerified, setIsPhoneVerified] = useState(false)
  const [phoneError, setPhoneError] = useState("")
  const [showTransitDetails, setShowTransitDetails] = useState(false)

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

  if (!isPhoneVerified) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <section className="w-full max-w-md rounded-2xl border border-border bg-background p-6 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-xl">🔒</div>
          <h1 className="text-2xl font-black tracking-tight">Order protected</h1>
          <p className="mt-2 text-sm text-muted-foreground">Enter the last 4 digits of the phone number used for this order to view tracking.</p>
          <div className="mt-5 flex justify-center gap-3" aria-label="Last 4 digits">
            {[0, 1, 2, 3].map((index) => (
              <input key={index} id={`phone-digit-${index}`} value={phoneLast4[index] || ""} onChange={(event) => {
                const digit = event.target.value.replace(/\D/g, "").slice(-1)
                const next = phoneLast4.split("")
                next[index] = digit
                const entered = next.join("").slice(0, 4)
                setPhoneLast4(entered); setPhoneError("")
                if (entered.length === 4) {
                  const expected = String(order.address.phone || "").replace(/\D/g, "").slice(-4)
                  if (expected && entered === expected) setIsPhoneVerified(true)
                  else setPhoneError("Those digits do not match the order phone number.")
                }
                if (digit && index < 3) document.getElementById(`phone-digit-${index + 1}`)?.focus()
              }} onKeyDown={(event) => { if (event.key === "Backspace" && !phoneLast4[index] && index > 0) document.getElementById(`phone-digit-${index - 1}`)?.focus() }} inputMode="numeric" maxLength={1} className="h-14 w-12 rounded-xl border-2 border-border bg-secondary/30 text-center text-xl font-black outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20" />
            ))}
          </div>
          <button type="button" onClick={() => {
            const expected = String(order.address.phone || "").replace(/\D/g, "").slice(-4)
            if (phoneLast4.length === 4 && expected && phoneLast4 === expected) setIsPhoneVerified(true)
            else setPhoneError("Those digits do not match the order phone number.")
          }} className="mt-4 h-11 w-full rounded-xl bg-foreground text-sm font-black uppercase tracking-widest text-background">View tracking</button>
          {phoneError && <p className="mt-3 text-xs font-bold text-red-600">{phoneError}</p>}
        </section>
      </main>
    )
  }

  // Combine carrier-live scans with webhook/order scans. Either source may
  // contain the newest event, so one must never replace the other.
  const scanEvents = Array.from(new Map(
    [...(Array.isArray(order.delhiveryScans) ? order.delhiveryScans : []), ...(Array.isArray(tracking?.scans) ? tracking.scans : [])]
      .filter((scan): scan is { status: string; location: string; date: string } => Boolean(scan && typeof scan === "object"))
      .map((scan) => [`${scan.status || ""}|${scan.location || ""}|${scan.date || ""}`, scan] as const),
  ).values())
  const liveStatus = getLiveFulfillmentStatus(order.fulfillmentStatus, scanEvents, tracking?.status || order.delhiveryStatus || order.shiprocketStatus)
  const rawStatus = liveStatus
  // Pickup is shown as a sub-phase; the main progress track moves directly to In Transit.
  const currentStatus = rawStatus === "picked_up" ? "shipped" : rawStatus
  const currentIndex = ORDER_STATUS_STEPS.indexOf(currentStatus as any)
  const completedIndex = currentStatus === "cancelled" || currentStatus === "failed_to_ship" ? -1 : Math.max(0, currentIndex)
  const hasCourierMapLocation = Number.isFinite(tracking?.latitude) && Number.isFinite(tracking?.longitude)
  const canShowCourierMap = hasCourierMapLocation && ["out_for_delivery", "delivered"].includes(currentStatus)
  // Keep the complete carrier movement history visible even after the main
  // phase advances to OFD or Delivered.
  const carrierStatus = tracking?.status || order.delhiveryStatus || order.shiprocketStatus
  const currentSubPhases = getTrackingSubPhases("shipped", scanEvents, carrierStatus)
  const deliveredScan = [...scanEvents].reverse().find((scan) => /delivered/i.test(scan.status || ""))
  const deliveredAt = tracking?.deliveredAt || order.deliveredAt || deliveredScan?.date || ""
  const outForDeliveryScan = [...scanEvents].reverse().find((scan) => /out for delivery|\bofd\b/i.test(scan.status || ""))
  // Keep the moving indicator on the main track. During transit each new
  // carrier scan nudges it forward, but it is capped before Out for Delivery.
  const progressPercent = currentStatus === "delivered"
    ? 100
    : currentStatus === "out_for_delivery"
      ? 76
      : currentStatus === "shipped"
        ? Math.min(68, 52 + currentSubPhases.length * 1.25)
        : currentStatus === "packaged"
          ? 34
          : 8

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
            <InfoBox label="AWB" value={order.delhiveryWaybill || order.trackingNumber || order.shippingId || tracking?.awb || "Not available yet"} />
            <InfoBox label="Courier" value={tracking?.courierName || order.courierName || "Not assigned yet"} />
            <InfoBox
              label={currentStatus === "delivered" ? "Delivery Status" : "Expected Delivery"}
              value={currentStatus === "delivered"
                ? `Delivered${deliveredAt ? ` on ${formatTrackingDate(deliveredAt)}` : ""}`
                : formatExpectedDelivery(tracking?.estimatedDelivery || order.estimatedDelivery)}
            />
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
          <div className="relative mt-6 space-y-0">
            <div className="pointer-events-none absolute bottom-12 left-[14px] top-4 w-[3px]" aria-hidden="true">
              <div className="absolute inset-0 text-foreground/45" style={{ backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1.5px)", backgroundSize: "4px 8px" }} />
              <div className="absolute left-0 top-0 z-10 w-full rounded-full bg-accent transition-all duration-500" style={{ height: `${progressPercent}%` }} />
              {currentStatus !== "delivered" && (
                <div className="absolute left-1/2 z-30 block h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-accent opacity-100 shadow-[0_0_0_4px_rgba(255,70,70,0.16),0_0_14px_rgba(255,70,70,0.8)] transition-all duration-500" style={{ top: `${progressPercent}%` }} aria-label={`Progress: ${getOrderStatusLabel(currentStatus)}`} />
              )}
            </div>
            {ORDER_STATUS_STEPS.map((status, index) => {
              const done = index <= completedIndex
              const active = status === currentStatus
              const phaseScans = status === "shipped" ? currentSubPhases : []
              const phaseTimestamp = status === "delivered"
                ? deliveredAt
                : status === "out_for_delivery"
                  ? outForDeliveryScan?.date || ""
                  : ""
              return (
                <div key={status} className="flex gap-3">
                  <div className="relative z-10 flex flex-col items-center">
                    <div className={`relative flex h-8 w-8 items-center justify-center rounded-full border ${done ? "border-accent bg-accent text-accent-foreground" : "border-border bg-secondary text-muted-foreground"} ${active ? "shadow-[0_0_0_5px_rgba(255,70,70,0.16),0_0_18px_rgba(255,70,70,0.7)]" : ""}`}>
                      {String(status).includes("delivered") ? <CheckCircle2 className="h-4 w-4" /> : String(status).includes("ship") ? <Truck className="h-4 w-4" /> : <PackageCheck className="h-4 w-4" />}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1 pb-5">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <p className={`font-black ${active ? "text-accent" : ""}`}>{getOrderStatusLabel(status)}</p>
                      {phaseTimestamp && <span className="text-[11px] font-bold text-muted-foreground">{formatTrackingDate(phaseTimestamp)}</span>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{index <= completedIndex ? "Shipment update received" : "Pending"}</p>
                    {status === "shipped" && phaseScans.length > 0 && (
                      <div className="mt-3">
                        <button type="button" onClick={() => setShowTransitDetails((value) => !value)} className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-accent hover:underline">
                          {showTransitDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          {showTransitDetails ? "Show less" : "See details"}
                        </button>
                        {showTransitDetails && <div className="mt-2 space-y-2">
                        {phaseScans.map((event, eventIndex) => (
                          <div key={`${event.status}-${event.date}-${eventIndex}`}>
                            <p className="text-xs font-black text-foreground">{event.status}</p>
                            {event.location && <p className="text-[11px] text-muted-foreground">{event.location}</p>}
                            {event.date && <p className="text-[10px] font-bold text-muted-foreground">{formatTrackingDate(event.date)}</p>}
                          </div>
                        ))}
                        </div>}
                      </div>
                    )}
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
  const refreshToken = Date.now().toString()
  const [orderResponse, trackingResponse] = await Promise.all([
      fetch(`/api/orders/${encodeURIComponent(orderId)}?refresh=${refreshToken}`, { cache: "no-store" }),
      fetch(`/api/shiprocket/tracking/${encodeURIComponent(orderId)}?refresh=${refreshToken}`, { cache: "no-store" }),
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

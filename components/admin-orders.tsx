"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { MutableRefObject, ReactNode } from "react"
import { Camera, CheckCircle2, ChevronDown, ChevronUp, ClipboardList, ExternalLink, Eye, EyeOff, IndianRupee, MapPin, Minus, PackageCheck, Plus, Printer, ScanLine, Send, Trash2, Truck, Volume2, X, XCircle } from "lucide-react"
import { confirmAction } from "@/lib/confirm-action"
import { clearOrders, getOrderDisplayId, isCancelledOrderExpired, readOrders, fetchOrders, type StoreOrder } from "@/lib/orders"
import { getCustomPrintLabel, getJerseyBackLabel, getJerseyVersionLabel, isCustomBack, PATCHES_PRICE } from "@/lib/store-context"
import { kits } from "@/lib/data"
import { getKitSizeStock, KIT_SIZES, readCachedAdminInventory, type EditableKit } from "@/lib/inventory-client"
import { getShippingSku } from "@/lib/shipping-sku"
import { getLiveFulfillmentStatus, getOrderStatusLabel as getFulfillmentStatusLabel, getTrackingSubPhases } from "@/lib/tracking"

type RevenueEntry = {
  id: string
  amount: number
  reason: string
  createdAt: string
  kind: "manual"
}

type PinCodeLookup = Record<string, {
  city: string
  district: string
  state: string
  taluk?: string
  offices?: string[]
}>

type AddressSuggestion = {
  properties: {
    formatted?: string
    address_line1?: string
    address_line2?: string
    city?: string
    county?: string
    state?: string
    postcode?: string
    place_id?: string
    latitude?: number
    longitude?: number
  }
}

function findOrderByScannedValue(orders: StoreOrder[], value: string) {
  const scanned = value.trim().toLowerCase()
  if (!scanned) return undefined
  return orders.find((order) => {
    return [
      order.id,
      order.delhiveryWaybill,
      order.delhiveryOrderId,
      order.delhiveryPickupId,
      order.shiprocketOrderId,
      order.shiprocketDisplayOrderId,
      order.shiprocketShipmentId,
    ].some((candidate) => String(candidate || "").trim().toLowerCase() === scanned)
  })
}

let pinCodeLookupCache: Promise<PinCodeLookup> | null = null

export function AdminOrders() {
  const [orders, setOrders] = useState<StoreOrder[]>([])
  const knownOrderIdsRef = useRef<Set<string> | null>(null)
  const alertTimeoutRef = useRef<number | null>(null)
  const alertAudioContextRef = useRef<AudioContext | null>(null)
  const alertEnabledRef = useRef(false)
  const [alertEnabled, setAlertEnabled] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([])
  const [orderTab, setOrderTab] = useState<"progress" | "delivered">("progress")
  const [scannedOrderId, setScannedOrderId] = useState("")
  const [scanMessage, setScanMessage] = useState("")
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false)
  const [cameraScanMessage, setCameraScanMessage] = useState("")
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null)
  const cameraControlsRef = useRef<{ stop: () => void } | null>(null)

  useEffect(() => {
    const syncOrders = async () => {
      // Pull the latest Delhivery scans/status before rendering the admin list.
      // The webhook remains the primary path; this catches missed carrier events.
      await fetch("/api/delhivery/sync", { method: "POST", cache: "no-store" }).catch(() => null)
      const data = await fetchOrders()
      const nextIds = new Set(data.map((order) => order.id))
      const knownIds = knownOrderIdsRef.current

      if (knownIds && alertEnabledRef.current && data.some((order) => !knownIds.has(order.id))) {
        if (alertTimeoutRef.current) window.clearTimeout(alertTimeoutRef.current)
        playNewOrderAlert(alertAudioContextRef.current)
      }

      knownOrderIdsRef.current = nextIds
      setOrders(data)
    }

    syncOrders()
    const interval = window.setInterval(syncOrders, 10000)
    window.addEventListener("storage", syncOrders)
    window.addEventListener("focus", syncOrders)

    return () => {
      window.clearInterval(interval)
      if (alertTimeoutRef.current) window.clearTimeout(alertTimeoutRef.current)
      alertAudioContextRef.current?.close().catch(() => null)
      window.removeEventListener("storage", syncOrders)
      window.removeEventListener("focus", syncOrders)
    }
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  const visibleOrders = useMemo(() => {
    return orders.filter((order) => !isCancelledOrderExpired(order, now))
  }, [orders, now])
  const progressOrders = visibleOrders.filter((order) => order.fulfillmentStatus !== "delivered")
  const deliveredOrders = visibleOrders.filter((order) => order.fulfillmentStatus === "delivered")
  const displayedOrders = orderTab === "delivered" ? deliveredOrders : progressOrders
  const selectedOrders = useMemo(() => {
    const selected = new Set(selectedOrderIds)
    return displayedOrders.filter((order) => selected.has(order.id))
  }, [selectedOrderIds, displayedOrders])

  useEffect(() => {
    // Do not depend on displayedOrders: it is a newly filtered array on every
    // render, which turned this state tidy-up into an update loop in the admin.
    const visibleIds = new Set(
      orders
        .filter((order) => !isCancelledOrderExpired(order, Date.now()))
        .filter((order) => orderTab === "delivered" ? order.fulfillmentStatus === "delivered" : order.fulfillmentStatus !== "delivered")
        .map((order) => order.id),
    )
    setSelectedOrderIds((current) => {
      const next = current.filter((id) => visibleIds.has(id))
      // displayedOrders is derived into a fresh array each render. Returning the
      // existing state when nothing was removed prevents this housekeeping effect
      // from continuously scheduling another render.
      return next.length === current.length ? current : next
    })
  }, [orders, orderTab])

  const handleClearOrders = async () => {
    if (!(await confirmAction(`Are you sure you want to clear ${visibleOrders.length} order${visibleOrders.length === 1 ? "" : "s"} from this admin view? This cannot be undone from this button.`))) {
      return
    }

    clearOrders()
    setOrders([])
  }

  const accountEmails = new Set(visibleOrders.map((order) => order.customerEmail || order.address.email).filter(Boolean))
  const refreshOrders = () => fetchOrders().then(setOrders).catch(() => null)
  const allVisibleSelected = displayedOrders.length > 0 && selectedOrderIds.length === displayedOrders.length

  const toggleAllOrders = () => {
    setSelectedOrderIds(allVisibleSelected ? [] : displayedOrders.map((order) => order.id))
  }

  const toggleOrderSelection = (orderId: string) => {
    setSelectedOrderIds((current) => current.includes(orderId) ? current.filter((id) => id !== orderId) : [...current, orderId])
  }

  const findScannedOrder = () => {
    const match = findOrderByScannedValue(visibleOrders, scannedOrderId)

    if (!match) {
      setScanMessage("No matching order found.")
      return
    }

    openMatchedOrder(match)
  }

  const stopCameraScanner = () => {
    cameraControlsRef.current?.stop()
    cameraControlsRef.current = null
    const video = cameraVideoRef.current
    const stream = video?.srcObject
    if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop())
    if (video) video.srcObject = null
    setIsCameraScannerOpen(false)
  }

  const openCameraScanner = async () => {
    setCameraScanMessage("")
    try {
      setIsCameraScannerOpen(true)
      window.setTimeout(async () => {
        const video = cameraVideoRef.current
        if (!video) return
        const { BrowserMultiFormatReader } = await import("@zxing/browser")
        const reader = new BrowserMultiFormatReader()
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } }, audio: false },
          video,
          (result) => {
            if (!result) return
            const value = result.getText().trim()
            if (!value) return
            setScannedOrderId(value)
            const match = findOrderByScannedValue(visibleOrders, value)
            stopCameraScanner()
            if (match) openMatchedOrder(match)
            else setScanMessage(`Scanned ${value}, but no matching order was found.`)
          },
        )
        cameraControlsRef.current = controls
      }, 0)
    } catch {
      stopCameraScanner()
      setScanMessage("Camera access was not available. Allow camera permission and try again.")
    }
  }

  useEffect(() => {
    return () => {
      cameraControlsRef.current?.stop()
      const stream = cameraVideoRef.current?.srcObject
      if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop())
    }
  }, [])

  const openMatchedOrder = (match: StoreOrder) => {
    setOrderTab(match.fulfillmentStatus === "delivered" ? "delivered" : "progress")
    setSelectedOrderIds([match.id])
    setScanMessage(`Order found: ${getOrderDisplayId(match)}`)
    window.setTimeout(() => {
      document.getElementById(`admin-order-${match.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
    }, 50)
  }

  const printSelectedStickers = (labelOrientation: "horizontal" | "vertical") => {
    if (selectedOrders.length === 0) return
    printOrderStickers(selectedOrders, labelOrientation)
  }

  const enableAndTestAlert = async () => {
    const context = await unlockOrderAlertAudio(alertAudioContextRef)
    if (!context) return

    alertEnabledRef.current = true
    setAlertEnabled(true)
    if (alertTimeoutRef.current) window.clearTimeout(alertTimeoutRef.current)
    alertTimeoutRef.current = window.setTimeout(() => {
      playNewOrderAlert(context)
      alertTimeoutRef.current = null
    }, 5000)
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2">
        <InfoCard icon={<ClipboardList className="h-4 w-4" />} label="Orders" value={visibleOrders.length.toString()} />
        <InfoCard icon={<PackageCheck className="h-4 w-4" />} label="Order Accounts" value={accountEmails.size.toString()} />
      </section>
      <ManualOrderForm onOrderCreated={refreshOrders} />
      <section className="rounded-xl border border-border bg-background/85 p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1">
            <span className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              <ScanLine className="h-4 w-4 text-accent" />
              Scan Order Barcode
            </span>
            <input
              value={scannedOrderId}
              onChange={(event) => {
                setScannedOrderId(event.target.value)
                setScanMessage("")
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  findScannedOrder()
                }
              }}
              autoComplete="off"
              inputMode="text"
              placeholder="Scan or enter Order ID"
              className="h-11 w-full rounded-lg border border-border bg-secondary/20 px-3 font-mono text-sm font-black outline-none focus:border-accent"
            />
          </label>
          <button
            type="button"
            onClick={findScannedOrder}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-xs font-black uppercase tracking-widest text-background"
          >
            <ScanLine className="h-4 w-4" />
            Find Order
          </button>
          <button
            type="button"
            onClick={openCameraScanner}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-accent/30 px-4 text-xs font-black uppercase tracking-widest text-accent hover:bg-accent/10"
          >
            <Camera className="h-4 w-4" />
            Open Camera
          </button>
        </div>
        {scanMessage && <p className="mt-2 text-xs font-bold text-muted-foreground">{scanMessage}</p>}
      </section>
      {isCameraScannerOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-xl border border-white/20 bg-black text-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/15 px-4 py-3">
              <div>
                <p className="text-sm font-black">Scan Order Barcode</p>
                <p className="text-xs text-white/60">Place the Order ID barcode inside the frame.</p>
              </div>
              <button
                type="button"
                onClick={stopCameraScanner}
                aria-label="Close camera scanner"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="relative aspect-[4/3] bg-black">
              <video ref={cameraVideoRef} playsInline muted className="h-full w-full object-cover" />
              <div className="pointer-events-none absolute inset-[18%] border-2 border-accent shadow-[0_0_0_999px_rgba(0,0,0,0.35)]" />
            </div>
            <div className="px-4 py-3 text-center text-xs font-bold text-white/70">
              {cameraScanMessage || "Scanning automatically..."}
            </div>
          </div>
        </div>
      )}
    <div className="border border-border rounded-2xl bg-background/85 p-5 shadow-sm">
      <div className="grid gap-3 mb-4 xl:grid-cols-[minmax(140px,auto)_1fr] xl:items-start">
        <div className="flex min-w-0 items-center gap-2">
          <ClipboardList className="w-5 h-5 text-accent" />
          <h2 className="font-black text-xl tracking-tight whitespace-nowrap">Orders</h2>
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-black text-accent">{displayedOrders.length}</span>
          <button
            type="button"
            onClick={enableAndTestAlert}
            title={alertEnabled ? "Test alert in 5 seconds" : "Enable order alerts and test in 5 seconds"}
            aria-label={alertEnabled ? "Test order alert" : "Enable order alerts"}
            className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border px-2 text-[10px] font-black uppercase tracking-wider ${alertEnabled ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600" : "border-accent/30 text-accent hover:bg-accent/10"}`}
          >
            <Volume2 className="h-4 w-4" />
            {alertEnabled ? "Alerts On" : "Enable Alerts"}
          </button>
        </div>
        {visibleOrders.length > 0 && (
          <div className="flex w-full flex-wrap items-center gap-2 xl:justify-end">
            <div className="grid min-w-[260px] flex-1 grid-cols-2 rounded-lg border border-border bg-background p-1 sm:flex-none">
              <button
                type="button"
                onClick={() => {
                  setOrderTab("progress")
                  setSelectedOrderIds([])
                }}
                className={`h-8 rounded-md px-3 text-[10px] font-black uppercase tracking-widest ${orderTab === "progress" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
              >
                In Progress ({progressOrders.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setOrderTab("delivered")
                  setSelectedOrderIds([])
                }}
                className={`h-8 rounded-md px-3 text-[10px] font-black uppercase tracking-widest ${orderTab === "delivered" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
              >
                Delivered ({deliveredOrders.length})
              </button>
            </div>
            <button
              type="button"
              onClick={toggleAllOrders}
              className="inline-flex h-9 min-w-[110px] items-center justify-center rounded-lg border border-border px-3 text-xs font-black uppercase tracking-widest hover:bg-secondary"
            >
              {allVisibleSelected ? "Unselect All" : "Select All"}
            </button>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={selectedOrders.length === 0}
                onClick={() => printSelectedStickers("horizontal")}
                className="inline-flex h-9 min-w-[170px] items-center justify-center gap-2 rounded-lg border border-accent/30 px-3 text-xs font-black uppercase tracking-widest text-accent hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Printer className="w-4 h-4" />
                Print Horizontal Label ({selectedOrders.length})
              </button>
              <button
                type="button"
                disabled={selectedOrders.length === 0}
                onClick={() => printSelectedStickers("vertical")}
                className="inline-flex h-9 min-w-[150px] items-center justify-center gap-2 rounded-lg border border-border px-3 text-xs font-black uppercase tracking-widest hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Printer className="w-4 h-4" />
                Print Vertical Label
              </button>
            </div>
            <button
              onClick={handleClearOrders}
              className="inline-flex h-9 min-w-[130px] items-center justify-center gap-2 rounded-lg border border-red-500/30 px-3 text-xs font-black uppercase tracking-widest text-red-500 hover:bg-red-500/10"
            >
              <Trash2 className="w-4 h-4" />
              Clear Orders
            </button>
          </div>
        )}
      </div>

      {displayedOrders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
          {orderTab === "delivered" ? "No delivered orders yet." : "No in-progress orders yet. New customer orders will appear here after checkout."}
        </div>
      ) : (
        <div className="space-y-4">
          {displayedOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onOrdersChange={setOrders}
              isSelected={selectedOrderIds.includes(order.id)}
              onSelectionChange={() => toggleOrderSelection(order.id)}
            />
          ))}
        </div>
      )}
    </div>
    </div>
  )
}

async function unlockOrderAlertAudio(contextRef: MutableRefObject<AudioContext | null>) {
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return null

    const context = contextRef.current && contextRef.current.state !== "closed"
      ? contextRef.current
      : new AudioContextClass()
    contextRef.current = context
    if (context.state === "suspended") await context.resume()

    const oscillator = context.createOscillator()
    const gain = context.createGain()
    gain.gain.value = 0.0001
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.01)
    return context
  } catch {
    return null
  }
}

function playNewOrderAlert(context: AudioContext | null) {
  try {
    if (!context || context.state !== "running") return
    const playTone = (start: number, duration: number, frequency: number) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = "square"
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02)
      gain.gain.setValueAtTime(0.18, start + Math.max(0.03, duration - 0.04))
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.start(start)
      oscillator.stop(start + duration + 0.01)
    }

    const start = context.currentTime
    playTone(start, 0.55, 880)
    playTone(start + 0.68, 0.55, 1120)
    playTone(start + 1.36, 0.55, 880)
    playTone(start + 2.04, 0.55, 1120)
  } catch {
    // Alert audio stays optional if a browser blocks Web Audio.
  }
}

export function AdminRevenue() {
  const [orders, setOrders] = useState<StoreOrder[]>([])
  const [now, setNow] = useState(Date.now())
  const [, setRevenueAdjustment] = useState(0)
  const [revenueEntries, setRevenueEntries] = useState<RevenueEntry[]>([])
  const [period, setPeriod] = useState<"month" | "year" | "all">("month")

  useEffect(() => {
    const syncRevenue = () => fetch("/api/admin/revenue", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        setRevenueAdjustment(Number(data.revenue.adjustment || 0))
        setRevenueEntries(Array.isArray(data.revenue.entries) ? data.revenue.entries : [])
      })
      .catch(() => null)
    const syncOrders = () => fetchOrders().then(setOrders).catch(() => null)

    syncOrders()
    syncRevenue()
    const interval = window.setInterval(() => {
      syncOrders()
      syncRevenue()
    }, 15000)

    window.addEventListener("focus", syncOrders)
    window.addEventListener("focus", syncRevenue)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener("focus", syncOrders)
      window.removeEventListener("focus", syncRevenue)
    }
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  const visibleOrders = useMemo(() => {
    return orders.filter((order) => !isCancelledOrderExpired(order, now))
  }, [orders, now])
  const revenueOrders = visibleOrders.filter((order) => {
    if (order.fulfillmentStatus === "cancelled") return false
    if (order.status === "paid") return isInRevenuePeriod(order.createdAt, period)
    if (order.status === "cod") {
      return order.fulfillmentStatus === "delivered" && isInRevenuePeriod(order.createdAt, period)
    }
    return false
  })
  const periodEntries = revenueEntries.filter((entry) => isInRevenuePeriod(entry.createdAt, period))
  const paidRevenue = revenueOrders.reduce((sum, order) => sum + order.total, 0)
  const periodAdjustment = periodEntries.reduce((sum, entry) => sum + entry.amount, 0)

  return (
    <div className="space-y-5">
      <div className="inline-grid grid-cols-3 rounded-xl border border-border bg-background p-1">
        {(["month", "year", "all"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setPeriod(item)}
            className={`h-10 rounded-lg px-4 text-xs font-black uppercase tracking-widest ${period === item ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
          >
            {item === "month" ? "This Month" : item === "year" ? "This Year" : "All Time"}
          </button>
        ))}
      </div>
      <RevenueBar
        orderRevenue={paidRevenue}
        automaticEntries={revenueOrders}
        adjustment={periodAdjustment}
        onAdjustmentChange={setRevenueAdjustment}
        entries={periodEntries}
        onEntriesChange={setRevenueEntries}
      />
    </div>
  )
}

export function AdminRefunds() {
  const [orders, setOrders] = useState<StoreOrder[]>([])

  useEffect(() => {
    const syncOrders = () => fetchOrders().then(setOrders).catch(() => null)
    syncOrders()
    const interval = window.setInterval(syncOrders, 10000)
    window.addEventListener("focus", syncOrders)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener("focus", syncOrders)
    }
  }, [])

  const refunds = orders.filter((order) => order.returnStatus && order.returnStatus !== "none")

  return (
    <div className="border border-border rounded-2xl bg-background/85 p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <IndianRupee className="h-5 w-5 text-accent" />
        <h2 className="font-black text-xl tracking-tight">Order Adjustments</h2>
        <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-black text-accent">{refunds.length}</span>
      </div>
      {refunds.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
          No adjustment requests yet.
        </div>
      ) : (
        <div className="space-y-3">
          {refunds.map((order) => (
            <div key={order.id} className="rounded-xl border border-border p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-black">{order.id}</p>
                  <p className="text-xs text-muted-foreground">{order.address.name} - {order.address.email}</p>
                </div>
                <span className="w-fit rounded-full bg-accent/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-accent">
                  {order.returnStatus}
                </span>
              </div>
              <p className="mt-3 text-sm"><span className="font-black">Reason:</span> {order.returnReason || "Not specified"}</p>
              {order.returnNote && <p className="mt-1 text-sm text-muted-foreground">{order.returnNote}</p>}
              <p className="mt-2 text-xs text-muted-foreground">Total: ₹{order.total.toLocaleString("en-IN")}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RevenueBar({
  adjustment,
  automaticEntries,
  entries,
  onAdjustmentChange,
  onEntriesChange,
  orderRevenue,
}: {
  adjustment: number
  automaticEntries: StoreOrder[]
  entries: RevenueEntry[]
  onAdjustmentChange: (value: number) => void
  onEntriesChange: (value: RevenueEntry[]) => void
  orderRevenue: number
}) {
  const [amount, setAmount] = useState("")
  const [reason, setReason] = useState("")
  const [noReason, setNoReason] = useState(false)
  const [message, setMessage] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [isHidden, setIsHidden] = useState(false)
  const totalRevenue = orderRevenue + adjustment

  const saveAdjustment = async (delta: number) => {
    if (!Number.isFinite(delta) || delta === 0) return
    if (!noReason && !reason.trim()) {
      setMessage("Add a reason or choose No reason.")
      return
    }

    setIsSaving(true)
    setMessage("")

    try {
      const response = await fetch("/api/admin/revenue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta, reason, noReason }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data.error || "Could not update revenue.")
      onAdjustmentChange(Number(data.revenue.adjustment || 0))
      onEntriesChange(Array.isArray(data.revenue.entries) ? data.revenue.entries : [])
      setAmount("")
      setReason("")
      setNoReason(false)
      setMessage("Revenue adjustment saved.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update revenue.")
    } finally {
      setIsSaving(false)
    }
  }

  const removeEntry = async (entry: RevenueEntry) => {
    if (!(await confirmAction(`Remove this manual revenue entry of ₹${Math.abs(entry.amount).toLocaleString("en-IN")}?`))) {
      return
    }

    setIsSaving(true)
    setMessage("")

    try {
      const response = await fetch("/api/admin/revenue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ removeEntryId: entry.id }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data.error || "Could not remove revenue entry.")
      onAdjustmentChange(Number(data.revenue.adjustment || 0))
      onEntriesChange(Array.isArray(data.revenue.entries) ? data.revenue.entries : [])
      setMessage("Revenue entry removed.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not remove revenue entry.")
    } finally {
      setIsSaving(false)
    }
  }

  const parsedAmount = Math.max(0, Number(amount || 0))
  const money = (value: number) => isHidden ? "Hidden" : `₹${value.toLocaleString("en-IN")}`

  return (
    <section className="rounded-2xl border border-border bg-background/85 p-5 shadow-sm space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <IndianRupee className="h-5 w-5 text-accent" />
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Revenue Ledger</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-3xl font-black tracking-tight">{money(totalRevenue)}</p>
            <button
              type="button"
              onClick={() => setIsHidden((current) => !current)}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border px-3 text-xs font-black uppercase tracking-widest hover:bg-secondary"
            >
              {isHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              {isHidden ? "Show" : "Hide"}
            </button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Orders: {money(orderRevenue)} | Manual: {isHidden ? "Hidden" : `${adjustment >= 0 ? "+" : "-"}₹${Math.abs(adjustment).toLocaleString("en-IN")}`}
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[140px_minmax(180px,1fr)_auto_auto] sm:items-end">
          <label className="space-y-1">
            <span className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">Manual Amount</span>
            <input
              type="number"
              min="0"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="Amount"
              className="h-10 w-full rounded-lg border border-border bg-secondary/30 px-3 text-sm font-bold outline-none focus:border-accent"
            />
          </label>
          <label className="space-y-1">
            <span className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">Reason</span>
            <input
              value={reason}
              disabled={noReason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={noReason ? "No reason selected" : "e.g. offline sale, refund, expense"}
              className="h-10 w-full rounded-lg border border-border bg-secondary/30 px-3 text-sm font-bold outline-none focus:border-accent disabled:opacity-50"
            />
          </label>
          <button
            type="button"
            disabled={isSaving || parsedAmount <= 0}
            onClick={() => saveAdjustment(parsedAmount)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-emerald-500/30 px-3 text-xs font-black uppercase tracking-widest text-emerald-600 hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
          <button
            type="button"
            disabled={isSaving || parsedAmount <= 0}
            onClick={() => saveAdjustment(-parsedAmount)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-red-500/30 px-3 text-xs font-black uppercase tracking-widest text-red-500 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Minus className="h-4 w-4" />
            Subtract
          </button>
          <label className="flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-xs font-bold sm:col-span-4">
            <input
              type="checkbox"
              checked={noReason}
              onChange={(event) => {
                setNoReason(event.target.checked)
                if (event.target.checked) setReason("")
              }}
            />
            No reason
          </label>
        </div>
      </div>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded-xl border border-border/60 p-3">
          <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Automatic order revenue</p>
          <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
            {automaticEntries.length === 0 ? (
              <p className="text-xs text-muted-foreground">No paid or COD orders counted yet.</p>
            ) : (
              automaticEntries.slice(0, 8).map((order) => (
                <RevenueLine
                  key={order.id}
                  amount={order.total}
                  hidden={isHidden}
                  label={order.id}
                  reason={order.status === "cod" ? "COD order" : "Paid order"}
                  createdAt={order.createdAt}
                />
              ))
            )}
          </div>
        </div>
        <div className="rounded-xl border border-border/60 p-3">
          <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Manual revenue history</p>
          <div className="space-y-2">
            {entries.length === 0 ? (
              <p className="text-xs text-muted-foreground">No manual revenue changes yet.</p>
            ) : (
              entries.map((entry) => (
                <RevenueLine
                  key={entry.id}
                  amount={entry.amount}
                  hidden={isHidden}
                  label={getRevenueEntryLabel(entry)}
                  reason={entry.reason}
                  createdAt={entry.createdAt}
                  onRemove={() => removeEntry(entry)}
                  removeDisabled={isSaving}
                />
              ))
            )}
          </div>
        </div>
      </div>
      {message && <p className="mt-3 text-xs font-bold text-accent">{message}</p>}
    </section>
  )
}

function getRevenueEntryLabel(entry: RevenueEntry) {
  const reason = entry.reason.trim()
  if (!reason || /^no reason$/i.test(reason)) return "No reason"
  return reason
}

function RevenueLine({
  amount,
  createdAt,
  label,
  onRemove,
  reason,
  removeDisabled,
  hidden,
}: {
  amount: number
  createdAt: string
  hidden?: boolean
  label: string
  onRemove?: () => void
  reason: string
  removeDisabled?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg bg-secondary/20 p-2 text-xs">
      <div className="min-w-0">
        <p className="truncate font-black">{label}</p>
        {reason && /^no reason$/i.test(reason.trim()) ? (
          <details className="mt-0.5 text-[10px] text-muted-foreground">
            <summary className="cursor-pointer list-none hover:text-foreground">No reason</summary>
            <p className="mt-1">No reason was added for this entry.</p>
          </details>
        ) : reason && reason.trim() !== label.trim() ? (
          <p className="truncate text-muted-foreground">{reason}</p>
        ) : null}
        <p className="text-[10px] text-muted-foreground">{new Date(createdAt).toLocaleString("en-IN")}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className={`font-black ${amount >= 0 ? "text-emerald-600" : "text-red-500"}`}>
          {hidden ? "Hidden" : `${amount >= 0 ? "+" : "-"}₹${Math.abs(amount).toLocaleString("en-IN")}`}
        </span>
        {onRemove && (
          <button
            type="button"
            disabled={removeDisabled}
            onClick={onRemove}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-red-500/30 text-red-500 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Remove revenue entry"
            title="Remove revenue entry"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

function isInRevenuePeriod(createdAt: string, period: "month" | "year" | "all") {
  if (period === "all") return true

  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return false

  const now = new Date()
  if (period === "year") {
    return date.getFullYear() === now.getFullYear()
  }

  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
}

function ManualOrderForm({ onOrderCreated }: { onOrderCreated: () => void }) {
  const [isOpen, setIsOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [pinCodeMessage, setPinCodeMessage] = useState("")
  const [form, setForm] = useState({
    status: "paid",
    name: "",
    phone: "",
    email: "",
    houseNumber: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    latitude: "",
    longitude: "",
    itemName: "",
    itemId: "",
    club: "",
    season: "",
    size: "M",
    quantity: "1",
    price: "1499",
    deliveryCharge: "100",
    discount: "0",
  })
  const [inventory, setInventory] = useState<EditableKit[]>(() => readCachedAdminInventory(kits))
  const [jerseyQuery, setJerseyQuery] = useState("")
  const [showJerseyOptions, setShowJerseyOptions] = useState(false)
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([])
  const [isAddressLookupOpen, setIsAddressLookupOpen] = useState(false)
  const [isAddressLookupLoading, setIsAddressLookupLoading] = useState(false)

  const quantity = Math.max(1, Number(form.quantity || 1))
  const price = Math.max(0, Number(form.price || 0))
  const subtotal = quantity * price
  const deliveryCharge = Math.max(0, Number(form.deliveryCharge || 0))
  const discount = Math.max(0, Number(form.discount || 0))
  const total = Math.max(0, subtotal + deliveryCharge - discount)

  const updateField = (key: keyof typeof form, value: string) => {
    if (key === "pincode") {
      const pincode = value.replace(/\D/g, "").slice(0, 6)
      setPinCodeMessage("")
      setForm((current) => ({
        ...current,
        pincode,
        city: pincode.length === 6 ? current.city : "",
        state: pincode.length === 6 ? current.state : "",
      }))
      return
    }

    setForm((current) => ({ ...current, [key]: value }))
  }

  useEffect(() => {
    const query = form.address.trim()
    if (query.length < 3 || !isAddressLookupOpen) {
      setAddressSuggestions([])
      setIsAddressLookupLoading(false)
      return
    }

    let isActive = true
    const timeout = window.setTimeout(async () => {
      setIsAddressLookupLoading(true)
      try {
        const response = await fetch(`/api/address/autocomplete?q=${encodeURIComponent(query)}`, { cache: "no-store" })
        const data = await response.json().catch(() => null)
        if (!isActive) return
        setAddressSuggestions(Array.isArray(data.suggestions) ? data.suggestions : [])
      } catch {
        if (isActive) setAddressSuggestions([])
      } finally {
        if (isActive) setIsAddressLookupLoading(false)
      }
    }, 220)

    return () => {
      isActive = false
      window.clearTimeout(timeout)
    }
  }, [form.address, isAddressLookupOpen])

  const jerseyOptions = useMemo(() => {
    const query = jerseyQuery.trim().toLowerCase()
    if (query.length < 2) return []
    return inventory
      .filter((kit) => !kit.isRemoved && !kit.isArchived && !kit.isDraft)
      .filter((kit) => `${kit.name} ${kit.club} ${kit.season} ${kit.number} ${kit.color}`.toLowerCase().includes(query))
      .slice(0, 8)
  }, [inventory, jerseyQuery])

  const selectJersey = (kit: EditableKit) => {
    const size = form.size && getKitSizeStock(kit, form.size) > 0
      ? form.size
      : KIT_SIZES.find((currentSize) => getKitSizeStock(kit, currentSize) > 0) || form.size || "M"
    setForm((current) => ({
      ...current,
      itemId: String(kit.id),
      itemName: kit.name,
      club: kit.club,
      season: kit.season,
      size,
      price: String(kit.price),
    }))
    setJerseyQuery(`${kit.name} - ${kit.club} - ${kit.season}`)
    setShowJerseyOptions(false)
  }

  const selectAddressSuggestion = async (suggestion: AddressSuggestion) => {
    let properties = suggestion.properties

    if (properties.place_id) {
      try {
        const response = await fetch(`/api/address/details?id=${encodeURIComponent(properties.place_id)}&text=${encodeURIComponent(properties.address_line1 || properties.formatted || "")}`, { cache: "no-store" })
        const data = await response.json().catch(() => null)
        if (response.ok && data.properties) {
          properties = { ...properties, ...data.properties }
        }
      } catch {
        // Keep autocomplete result when details are unavailable.
      }
    }

    const formattedAddress = properties.formatted || [properties.address_line1, properties.address_line2].filter(Boolean).join(", ")
    const streetAddress = [properties.address_line1, properties.address_line2].filter(Boolean).join(", ") || formattedAddress
    const nextPincode = (properties.postcode || "").replace(/\D/g, "").slice(0, 6)

    setForm((current) => ({
      ...current,
      address: formatAddressCase(streetAddress),
      city: nextPincode ? "" : formatAddressCase(properties.city || properties.county || current.city),
      state: nextPincode ? "" : formatAddressCase(properties.state || current.state),
      pincode: nextPincode || current.pincode,
      latitude: properties.latitude ? String(properties.latitude) : current.latitude,
      longitude: properties.longitude ? String(properties.longitude) : current.longitude,
    }))
    setAddressSuggestions([])
    setIsAddressLookupOpen(false)
    if (nextPincode) setPinCodeMessage("Checking PIN code...")
  }

  useEffect(() => {
    const pincode = form.pincode.trim()
    let isActive = true

    if (pincode.length !== 6) {
      setPinCodeMessage("")
      return () => {
        isActive = false
      }
    }

    const fillCityState = async () => {
      setPinCodeMessage("Checking PIN code...")

      try {
        const lookup = await loadPinCodeLookup()
        const localEntry = lookup[pincode]

        if (localEntry) {
          if (!isActive) return
          setForm((current) => ({
            ...current,
            city: formatAddressCase(localEntry.city || current.city),
            state: formatAddressCase(localEntry.state || current.state),
          }))
          setPinCodeMessage("City and state filled from PIN code.")
          return
        }

        const onlineEntry = await lookupPinCodeOnline(pincode)
        if (!isActive) return

        if (onlineEntry) {
          setForm((current) => ({
            ...current,
            city: formatAddressCase(onlineEntry.city || current.city),
            state: formatAddressCase(onlineEntry.state || current.state),
            latitude: onlineEntry.latitude ? String(onlineEntry.latitude) : current.latitude,
            longitude: onlineEntry.longitude ? String(onlineEntry.longitude) : current.longitude,
          }))
          setPinCodeMessage("City and state filled from online lookup.")
        } else {
          setPinCodeMessage("PIN code not found. Enter city and state manually.")
        }
      } catch {
        if (isActive) setPinCodeMessage("Could not check PIN code. Enter city and state manually.")
      }
    }

    fillCityState()

    return () => {
      isActive = false
    }
  }, [form.pincode])

  const createOrder = async () => {
    setIsSaving(true)
    setMessage("")

    try {
      const response = await fetch("/api/admin/orders/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: form.status,
          address: {
            name: form.name,
            phone: form.phone,
            email: form.email,
            houseNumber: form.houseNumber,
            address: form.address,
            city: form.city,
            state: form.state,
            pincode: form.pincode,
            latitude: parseCoordinate(form.latitude),
            longitude: parseCoordinate(form.longitude),
          },
          item: {
            id: form.itemId ? Number(form.itemId) : undefined,
            name: form.itemName,
            club: form.club,
            season: form.season,
            size: form.size,
            quantity,
            price,
          },
          subtotal,
          deliveryCharge,
          discount,
          total,
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data.error || "Manual order could not be created.")
      const accountMessage = data.accountSaved && data.customer?.email
        ? ` Customer account saved for ${data.customer.email}.`
        : ""
      setMessage(data.emailSent ? `Manual order ${data.order.id} created and emailed.${accountMessage}` : `Manual order ${data.order.id} created.${accountMessage} Email was not sent.`)
      const { decrementOrderItems } = await import("@/lib/inventory-client")
      if (data.order.items) decrementOrderItems(data.order.items)
      setForm({
        status: "paid",
        name: "",
        phone: "",
        email: "",
        houseNumber: "",
        address: "",
        city: "",
        state: "",
        pincode: "",
        latitude: "",
        longitude: "",
        itemName: "",
        itemId: "",
        club: "",
        season: "",
        size: "M",
        quantity: "1",
        price: "1499",
        deliveryCharge: "100",
        discount: "0",
      })
      setJerseyQuery("")
      setAddressSuggestions([])
      setIsOpen(false)
      onOrderCreated()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Manual order could not be created.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-background/85 p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-black tracking-tight">Manual Order</h2>
          <p className="text-sm text-muted-foreground">Create an order by hand, email the customer, and attach it to their email history.</p>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen((value) => !value)}
          className="inline-flex h-10 items-center justify-center rounded-lg border border-border px-4 text-xs font-black uppercase tracking-widest hover:bg-secondary"
        >
          {isOpen ? "Close" : "Add Manual Order"}
        </button>
      </div>
      {isOpen && (
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <ManualInput label="Name" value={form.name} onChange={(value) => updateField("name", value)} />
          <ManualInput label="Phone" value={form.phone} onChange={(value) => updateField("phone", value)} />
          <ManualInput label="Email" value={form.email} onChange={(value) => updateField("email", value)} />
          <ManualInput label="House / Flat" value={form.houseNumber} onChange={(value) => updateField("houseNumber", value)} />
          <label className="relative space-y-1 lg:col-span-2">
            <span className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">Address</span>
            <input
              value={form.address}
              onChange={(event) => {
                updateField("address", event.target.value)
                setIsAddressLookupOpen(true)
              }}
              onFocus={() => setIsAddressLookupOpen(true)}
              placeholder="Search building, road, area..."
              className="h-10 w-full rounded-lg border border-border bg-secondary/30 px-3 text-sm font-bold outline-none focus:border-accent"
            />
            {isAddressLookupOpen && (isAddressLookupLoading || addressSuggestions.length > 0) && (
              <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-border bg-background shadow-xl">
                {isAddressLookupLoading && (
                  <div className="px-3 py-2 text-xs font-bold text-muted-foreground">Searching addresses...</div>
                )}
                {addressSuggestions.map((suggestion, index) => (
                  <button
                    key={`${suggestion.properties.formatted || suggestion.properties.address_line1 || "address"}-${index}`}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectAddressSuggestion(suggestion)}
                    className="w-full border-b border-border/60 px-3 py-2 text-left hover:bg-secondary"
                  >
                    <span className="block truncate text-sm font-black">{suggestion.properties.address_line1 || suggestion.properties.formatted || "Address"}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{suggestion.properties.address_line2 || suggestion.properties.formatted}</span>
                  </button>
                ))}
              </div>
            )}
          </label>
          <ManualInput label="City" value={form.city} onChange={(value) => updateField("city", value)} />
          <ManualInput label="State" value={form.state} onChange={(value) => updateField("state", value)} />
          <ManualInput label="Pincode" value={form.pincode} onChange={(value) => updateField("pincode", value)} inputMode="numeric" note={pinCodeMessage} />
          {(form.latitude || form.longitude) && (
            <div className="rounded-lg border border-border bg-secondary/20 p-3 text-xs font-bold text-muted-foreground">
              <p className="text-[10px] font-black uppercase tracking-widest">Coordinates</p>
              <p>{form.latitude || "?"}, {form.longitude || "?"}</p>
            </div>
          )}
          <label className="space-y-1">
            <span className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">Payment</span>
            <select value={form.status} onChange={(event) => updateField("status", event.target.value)} className="h-10 w-full rounded-lg border border-border bg-secondary/30 px-3 text-sm font-bold outline-none focus:border-accent">
              <option value="paid">Paid</option>
              <option value="cod">COD</option>
            </select>
          </label>
          <label className="relative space-y-1 lg:col-span-2">
            <span className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">Jersey / Item</span>
            <input
              value={jerseyQuery || form.itemName}
              onChange={(event) => {
                const value = event.target.value
                setJerseyQuery(value)
                setShowJerseyOptions(true)
                setForm((current) => ({ ...current, itemId: "", itemName: value }))
              }}
              onFocus={() => setShowJerseyOptions(true)}
              placeholder="Search player, club, season..."
              className="h-10 w-full rounded-lg border border-border bg-secondary/30 px-3 text-sm font-bold outline-none focus:border-accent"
            />
            {showJerseyOptions && jerseyOptions.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-border bg-background shadow-xl">
                {jerseyOptions.map((kit) => (
                  <button
                    key={kit.id}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectJersey(kit)}
                    className="flex w-full items-center justify-between gap-3 border-b border-border/60 px-3 py-2 text-left text-sm hover:bg-secondary"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-black">{kit.name} - {kit.club}</span>
                      <span className="block truncate text-xs text-muted-foreground">{kit.season} - ₹{kit.price.toLocaleString("en-IN")}</span>
                    </span>
                    <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-accent">Select</span>
                  </button>
                ))}
              </div>
            )}
          </label>
          <ManualInput label="Club" value={form.club} onChange={(value) => updateField("club", value)} />
          <ManualInput label="Season" value={form.season} onChange={(value) => updateField("season", value)} />
          <label className="space-y-1">
            <span className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">Size</span>
            <select
              value={form.size}
              onChange={(event) => updateField("size", event.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-secondary/30 px-3 text-sm font-bold outline-none focus:border-accent"
            >
              {KIT_SIZES.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </label>
          <ManualInput label="Quantity" type="number" value={form.quantity} onChange={(value) => updateField("quantity", value)} />
          <ManualInput label="Price" type="number" value={form.price} onChange={(value) => updateField("price", value)} />
          <ManualInput label="Delivery" type="number" value={form.deliveryCharge} onChange={(value) => updateField("deliveryCharge", value)} />
          <ManualInput label="Discount" type="number" value={form.discount} onChange={(value) => updateField("discount", value)} />
          <div className="rounded-lg border border-border bg-secondary/20 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Total</p>
            <p className="text-xl font-black">₹{total.toLocaleString("en-IN")}</p>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              disabled={isSaving}
              onClick={createOrder}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-xs font-black uppercase tracking-widest text-background disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              Create Order, Account & Email
            </button>
          </div>
        </div>
      )}
      {message && <p className="mt-3 text-xs font-bold text-accent">{message}</p>}
    </section>
  )
}

function ManualInput({
  inputMode,
  label,
  note,
  onChange,
  type = "text",
  value,
}: {
  inputMode?: "text" | "numeric" | "decimal" | "tel" | "search" | "email" | "url"
  label: string
  note?: string
  onChange: (value: string) => void
  type?: string
  value: string
}) {
  return (
    <label className="space-y-1">
      <span className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</span>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-lg border border-border bg-secondary/30 px-3 text-sm font-bold outline-none focus:border-accent"
      />
      {note && <span className="block text-[11px] font-bold text-muted-foreground">{note}</span>}
    </label>
  )
}

function loadPinCodeLookup() {
  if (!pinCodeLookupCache) {
    pinCodeLookupCache = fetch("/data/india-pincodes.json").then((response) => {
      if (!response.ok) throw new Error("PIN code lookup file could not be loaded.")
      return response.json() as Promise<PinCodeLookup>
    })
  }

  return pinCodeLookupCache
}

async function lookupPinCodeOnline(pincode: string) {
  const response = await fetch(`/api/address/autocomplete?q=${encodeURIComponent(pincode)}`)
  const data = await response.json().catch(() => null)
  const suggestions = Array.isArray(data.suggestions) ? data.suggestions as AddressSuggestion[] : []
  const match = suggestions.find((suggestion) => suggestion.properties.postcode === pincode) || suggestions[0]
  const properties = match.properties

  if (!properties.state) return null

  return {
    city: properties.city || properties.county || "",
    state: properties.state,
    latitude: properties.latitude,
    longitude: properties.longitude,
  }
}

function parseCoordinate(value: string) {
  const coordinate = Number(value)
  return Number.isFinite(coordinate) ? coordinate : undefined
}

function formatAddressCase(value: string) {
  return value
    .toLowerCase()
    .split(/(\s+|-|,|\.)/)
    .map((part) => {
      if (!/[a-z]/.test(part)) return part
      if (/^(po|ii|iii|iv|vi|vip|mg|btm|hsr|rbi|iit|iim|nri|ncr|dl|ka|tn|up|mp|mh|gj|rj|hr|pb|jk|ut|wb|ap|ts|kl|ga|or|od|br|jh|as|sk|mz|nl|mn|ml|tr)$/i.test(part)) {
        return part.toUpperCase()
      }
      return part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join("")
    .replace(/\s+/g, " ")
    .replace(/\bAnd\b/g, "and")
    .trim()
}

function OrderCard({
  isSelected,
  onOrdersChange,
  onSelectionChange,
  order,
}: {
  isSelected: boolean
  onOrdersChange: (orders: StoreOrder[]) => void
  onSelectionChange: () => void
  order: StoreOrder
}) {
  const [trackingNumber, setTrackingNumber] = useState(order.trackingNumber || order.shippingId || "")
  const [courierName, setCourierName] = useState(order.courierName || "")
  const [estimatedDelivery, setEstimatedDelivery] = useState(order.estimatedDelivery || "")
  const [cancellationReason, setCancellationReason] = useState(order.cancellationNote || "")
  const [pendingTrackingStatus, setPendingTrackingStatus] = useState<"picked_up" | "shipped" | "out_for_delivery" | null>(null)
  const [isSendingShippingEmail, setIsSendingShippingEmail] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [isCreatingDelhiveryOrder, setIsCreatingDelhiveryOrder] = useState(false)
  const [shippingMessage, setShippingMessage] = useState("")
  const [showDetails, setShowDetails] = useState(false)
  const [manualSubPhase, setManualSubPhase] = useState("")
  const [manualSubPhaseLocation, setManualSubPhaseLocation] = useState("")
  const [manualSubPhaseDate, setManualSubPhaseDate] = useState("")
  const [liveTracking, setLiveTracking] = useState<{ scans?: Array<{ status?: string; location?: string; date?: string }>; status?: string } | null>(null)
  const addressLines = [
    order.address.address,
    `${order.address.city}, ${order.address.state} - ${order.address.pincode}`,
  ].filter((line): line is string => Boolean(line))
  const hasCoordinates = Number.isFinite(order.address.latitude) && Number.isFinite(order.address.longitude)
  const statusLabel = getOrderStatusLabel(order.status)
  const statusClass = getOrderStatusClass(order.status)
  const fulfillmentStatus = order.fulfillmentStatus === "processing" ? "confirmed" : order.fulfillmentStatus || "confirmed"
  // Pick-up is a carrier sub-phase, never a separate fulfillment step.
  const displayFulfillmentStatus = fulfillmentStatus === "picked_up" ? "shipped" : fulfillmentStatus
  const safeItems = Array.isArray(order.items) ? order.items.filter(Boolean) : []
  const totalUnits = safeItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
  const parcelWeightKg = calculateOrderWeightKg(order)
  const trackingSaveStatus = pendingTrackingStatus || (["picked_up", "shipped", "out_for_delivery"].includes(fulfillmentStatus) ? fulfillmentStatus as "picked_up" | "shipped" | "out_for_delivery" : "picked_up")
  const hasDelhiveryOrder = Boolean(order.delhiveryWaybill || order.delhiveryOrderId || order.delhiveryPickupId)
  const hasCancellationRequest = Boolean(order.cancellationRequestedAt && fulfillmentStatus !== "cancelled")

  const setFulfillment = async (nextStatus: NonNullable<StoreOrder["fulfillmentStatus"]>) => {
    setShippingMessage("")

    const statusWarning = {
      pending: "move this order back to pending",
      packaged: "mark this order as packed",
      confirmed: "mark this order as confirmed",
      picked_up: "mark this order as picked up",
      shipped: "mark this order as shipped",
      out_for_delivery: "mark this order as out for delivery",
      delivered: "mark this order as delivered",
      failed_to_ship: "mark this order as failed to ship",
      cancelled: "cancel this order",
    }[nextStatus]

    const updates: Partial<StoreOrder> = {
      fulfillmentStatus: nextStatus,
      trackingNumber: trackingNumber.trim(),
      shippingId: trackingNumber.trim(),
      courierName: courierName.trim(),
      estimatedDelivery: estimatedDelivery.trim(),
      shippedAt: ["picked_up", "shipped", "out_for_delivery", "delivered"].includes(nextStatus) ? order.shippedAt || new Date().toISOString() : order.shippedAt,
    }
    setIsSendingShippingEmail(true)
    try {
      const shouldEmailCustomer = ["packaged", "picked_up", "shipped", "out_for_delivery", "delivered"].includes(nextStatus)
      const response = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, updates, sendStatusEmail: shouldEmailCustomer }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data.error || "Could not save order status.")
      await fetchOrders().then(onOrdersChange)
      setPendingTrackingStatus(null)
      setShippingMessage(`Marked ${getFulfillmentStatusLabel(nextStatus)}.${shouldEmailCustomer ? " Email sent." : ""}`)
    } catch (error) {
      setShippingMessage(error instanceof Error ? error.message : "Could not save order status.")
    } finally {
      setIsSendingShippingEmail(false)
    }
  }

  const sendStatusEmail = async () => {
    if (fulfillmentStatus === "cancelled") return

    setIsSendingShippingEmail(true)
    setShippingMessage("")

    try {
      const updates: Partial<StoreOrder> = {
        fulfillmentStatus,
        trackingNumber: trackingNumber.trim(),
        shippingId: trackingNumber.trim(),
        courierName: courierName.trim(),
        estimatedDelivery: estimatedDelivery.trim(),
        shippedAt: ["picked_up", "shipped", "out_for_delivery", "delivered"].includes(fulfillmentStatus) ? order.shippedAt || new Date().toISOString() : order.shippedAt,
      }
      const response = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, updates, sendStatusEmail: true }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data.error || "Could not send status email.")
      await fetchOrders().then(onOrdersChange)
      setPendingTrackingStatus(null)
      setShippingMessage(`${getFulfillmentStatusLabel(fulfillmentStatus)} email sent.`)
    } catch (error) {
      setShippingMessage(error instanceof Error ? error.message : "Could not send status email.")
    } finally {
      setIsSendingShippingEmail(false)
    }
  }

  const openTrackingFields = (nextStatus: "picked_up" | "shipped" | "out_for_delivery") => {
    setPendingTrackingStatus(nextStatus)
    setShippingMessage(`Add tracking details, then save ${getFulfillmentStatusLabel(nextStatus)}. The customer will get an email after it saves.`)
  }

  const addManualSubPhase = async () => {
    const status = manualSubPhase.trim()
    const location = manualSubPhaseLocation.trim()
    const date = manualSubPhaseDate ? new Date(manualSubPhaseDate).toISOString() : new Date().toISOString()
    if (!status) {
      setShippingMessage("Add a sub phase status first.")
      return
    }

    const nextFulfillmentStatus = getFulfillmentStatusFromSubPhase(status) || fulfillmentStatus
    const nextScan = { status, location, date }
    const nextScans = [...(order.delhiveryScans || []), nextScan]
    const updates: Partial<StoreOrder> = {
      fulfillmentStatus: nextFulfillmentStatus,
      delhiveryScans: nextScans,
      delhiveryStatus: [status, location ? `at ${location}` : ""].filter(Boolean).join(" "),
      trackingNumber: trackingNumber.trim() || order.delhiveryWaybill || order.shippingId,
      shippingId: trackingNumber.trim() || order.delhiveryWaybill || order.trackingNumber,
      courierName: courierName.trim() || "Delhivery",
      shippingProvider: "delhivery",
      shippedAt: ["picked_up", "shipped", "out_for_delivery", "delivered"].includes(nextFulfillmentStatus || "") ? order.shippedAt || date : order.shippedAt,
    }

    setIsSendingShippingEmail(true)
    setShippingMessage("")
    try {
      const response = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, updates, sendStatusEmail: false }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || "Could not add sub phase.")
      await fetchOrders().then(onOrdersChange)
      setManualSubPhase("")
      setManualSubPhaseLocation("")
      setManualSubPhaseDate("")
      setShippingMessage("Sub phase added and admin updated.")
    } catch (error) {
      setShippingMessage(error instanceof Error ? error.message : "Could not add sub phase.")
    } finally {
      setIsSendingShippingEmail(false)
    }
  }

  const handleCancelOrder = async () => {
    const reason = cancellationReason.trim() || "Cancelled by administrator"

    if (!(await confirmAction(`Are you sure you want to cancel order ${order.id}? This will restock inventory, mark the order cancelled, and send a cancellation email to the customer.`))) {
      return
    }

    setIsCancelling(true)
    setShippingMessage("")

    try {
      // 1. Mark the order as cancelled and wait for the server to confirm it.
      const updates: Partial<StoreOrder> = {
        fulfillmentStatus: "cancelled",
        cancellationBy: "admin",
        cancellationNote: reason,
        cancelledAt: new Date().toISOString(),
      }
      const updateResponse = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, updates, sendStatusEmail: false }),
      })
      const updateData = await updateResponse.json().catch(() => null)
      if (!updateResponse.ok) throw new Error(updateData?.error || "Could not cancel the order.")

      // 2. Restock only after cancellation was saved successfully.
      const { restockOrderItems } = await import("@/lib/inventory-client")
      restockOrderItems(order.items)
      await fetchOrders().then(onOrdersChange)

      // 3. Email the customer
      const response = await fetch("/api/customer/cancel-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...order, ...updates }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        setShippingMessage(`Order cancelled and restocked, but the customer email failed: ${data?.error || "email service unavailable"}`)
      } else {
        setShippingMessage(data.emailSent ? "Order cancelled. Restocked inventory and sent email to customer." : "Order cancelled & restocked. Email in dev mode.")
      }
    } catch (error) {
      setShippingMessage(error instanceof Error ? error.message : "Cancellation process failed.")
    } finally {
      setIsCancelling(false)
    }
  }

  const deleteCancelledOrder = async () => {
    if (fulfillmentStatus !== "cancelled") return
    if (!(await confirmAction(`Delete cancelled order ${order.id} from admin permanently?`))) return

    setShippingMessage("")
    try {
      const response = await fetch("/api/orders", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data.error || "Could not delete order.")

      const localOrders = readOrders().filter((item) => item.id !== order.id)
      window.localStorage.setItem("terrace_orders", JSON.stringify(localOrders))
      await fetchOrders().then(onOrdersChange)
    } catch (error) {
      setShippingMessage(error instanceof Error ? error.message : "Could not delete order.")
    }
  }

  const createDelhiveryOrder = async (options: { recreate?: boolean } = {}) => {
    if (fulfillmentStatus === "cancelled") return
    if (hasDelhiveryOrder && !options.recreate) {
      setShippingMessage("This order already has a Delhivery waybill.")
      return
    }
    const action = options.recreate ? "Recreate Delhivery shipment" : "Create Delhivery shipment"
    if (!(await confirmAction(`${action} for ${order.id}? This will create a fresh Delhivery waybill and save it on the order.`))) {
      return
    }

    setIsCreatingDelhiveryOrder(true)
    setShippingMessage("")
    try {
      const response = await fetch("/api/admin/delhivery/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, recreate: options.recreate === true }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data.error || "Delhivery order could not be created.")

      const refreshedOrders = await fetchOrders()
      const responseOrder = data?.order as StoreOrder | undefined
      onOrdersChange(responseOrder
        ? refreshedOrders.map((item) => item.id === order.id ? { ...item, ...responseOrder } : item)
        : refreshedOrders)
      setShippingMessage(`${options.recreate ? "Delhivery recreated" : "Delhivery created"}. Waybill: ${data.order.delhiveryWaybill || "saved"}${data.order.delhiveryPickupId ? ` | Pickup ID: ${data.order.delhiveryPickupId}` : ""}.`)
    } catch (error) {
      setShippingMessage(error instanceof Error ? error.message : "Delhivery order could not be created.")
      await fetchOrders().then(onOrdersChange).catch(() => null)
    } finally {
      setIsCreatingDelhiveryOrder(false)
    }
  }

  const printSticker = (labelOrientation: "horizontal" | "vertical") => {
    printOrderStickers([order], labelOrientation)
  }

  return (
    <div id={`admin-order-${order.id}`} className={`rounded-xl border bg-background ${isSelected ? "border-accent ring-2 ring-accent/20" : "border-border"}`}>
      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 rounded-lg border border-border px-2 py-1 text-[10px] font-black uppercase tracking-widest">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={onSelectionChange}
                className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
              />
              Select
            </label>
            <p className="truncate font-black">{order.address.name}</p>
            <p className="font-mono text-xs font-black text-muted-foreground">{getOrderDisplayId(order)}</p>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${statusClass}`}>
              {statusLabel}
            </span>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              {getFulfillmentStatusLabel(displayFulfillmentStatus)}
            </span>
            {fulfillmentStatus === "cancelled" && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest bg-red-500/10 text-red-600">
                {order.cancellationBy === "customer" ? "Order Cancelled by Customer" : "Cancelled & Restocked"}
              </span>
            )}
            {hasCancellationRequest && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest bg-amber-500/10 text-amber-600">
                Customer Requested Cancellation
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {totalUnits} item{totalUnits === 1 ? "" : "s"} · ₹{order.total.toLocaleString("en-IN")} · {new Date(order.createdAt).toLocaleString("en-IN")}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {(order.delhiveryWaybill || order.trackingNumber || order.shippingId) && (
            <a
              href={`/orders/${encodeURIComponent(order.id)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-accent/30 px-3 text-xs font-black uppercase tracking-widest text-accent hover:bg-accent/10"
            >
              <MapPin className="h-4 w-4" />
              Track
            </a>
          )}
          {getDelhiveryOneUrl(order) && (
            <a
              href={getDelhiveryOneUrl(order) || "#"}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border px-3 text-xs font-black uppercase tracking-widest hover:bg-secondary"
            >
              <Truck className="h-4 w-4" />
              Delhivery One
            </a>
          )}
          <button
            type="button"
            onClick={() => setShowDetails((current) => !current)}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border px-3 text-xs font-black uppercase tracking-widest hover:bg-secondary"
          >
            {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {showDetails ? "Hide Details" : "See Details"}
          </button>
        </div>
      </div>

      {showDetails && (
      <div className="border-t border-border p-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <p className="font-black">{getOrderDisplayId(order)}</p>
          {(order.delhiveryWaybill || order.delhiveryOrderId || order.delhiveryPickupId || order.shiprocketDisplayOrderId || order.shiprocketOrderId) && <p className="text-[10px] font-bold text-muted-foreground">Website reference: {order.id}</p>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => printSticker("horizontal")}
            className="inline-flex items-center justify-center gap-2 h-9 px-3 rounded-lg border border-border hover:bg-secondary text-xs font-black uppercase tracking-widest"
          >
            <Printer className="w-4 h-4" />
            Print Horizontal Label
          </button>
          <button
            onClick={() => printSticker("vertical")}
            className="inline-flex items-center justify-center gap-2 h-9 px-3 rounded-lg border border-border hover:bg-secondary text-xs font-black uppercase tracking-widest"
          >
            <Printer className="w-4 h-4" />
            Print Vertical Label
          </button>
          <button
            type="button"
            onClick={() => printOrderInvoice(order)}
            className="inline-flex items-center justify-center gap-2 h-9 px-3 rounded-lg border border-border hover:bg-secondary text-xs font-black uppercase tracking-widest"
          >
            <Printer className="w-4 h-4" />
            Print Invoice
          </button>
          {fulfillmentStatus !== "cancelled" && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                value={cancellationReason}
                onChange={(event) => setCancellationReason(event.target.value)}
                placeholder="Cancellation reason"
                className="h-9 rounded-lg border border-border bg-secondary/30 px-3 text-xs font-bold outline-none focus:border-accent sm:w-56"
              />
              <button
                onClick={handleCancelOrder}
                disabled={isCancelling}
                className="inline-flex items-center justify-center gap-2 h-9 px-3 rounded-lg border border-red-500/30 text-red-500 hover:bg-red-500/10 text-xs font-black uppercase tracking-widest disabled:cursor-not-allowed disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" />
                Cancel Order
              </button>
            </div>
          )}
          {fulfillmentStatus !== "cancelled" && (
            <button
              onClick={() => createDelhiveryOrder()}
              disabled={isCreatingDelhiveryOrder || hasDelhiveryOrder}
              className="inline-flex items-center justify-center gap-2 h-9 px-3 rounded-lg border border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 text-xs font-black uppercase tracking-widest disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Truck className="w-4 h-4" />
              {isCreatingDelhiveryOrder ? "Creating..." : hasDelhiveryOrder ? "Delhivery Created" : "Create Delhivery"}
            </button>
          )}
          {fulfillmentStatus !== "cancelled" && hasDelhiveryOrder && (
            <button
              type="button"
              onClick={() => createDelhiveryOrder({ recreate: true })}
              disabled={isCreatingDelhiveryOrder}
              className="inline-flex items-center justify-center gap-2 h-9 px-3 rounded-lg border border-amber-500/30 text-amber-600 hover:bg-amber-500/10 text-xs font-black uppercase tracking-widest disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Truck className="w-4 h-4" />
              Recreate Delhivery
            </button>
          )}
          {fulfillmentStatus === "cancelled" && (
            <button
              type="button"
              onClick={deleteCancelledOrder}
              className="inline-flex items-center justify-center gap-2 h-9 px-3 rounded-lg border border-red-500/30 text-red-500 hover:bg-red-500/10 text-xs font-black uppercase tracking-widest"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_1.2fr] gap-4 mt-4">
        <div className="rounded-lg border border-border/60 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Customer & Address</p>
          <p className="font-black">{order.address.name}</p>
          <p className="text-sm">{order.address.phone}</p>
          <p className="text-sm">{order.address.email}</p>
          <div className="mt-2 space-y-0.5">
            {order.address.houseNumber && <p className="text-sm"><span className="font-black">Flat / Floor:</span> {order.address.houseNumber}</p>}
            {addressLines.map((line) => (
              <p key={line} className="text-sm">{line}</p>
            ))}
            {order.address.deliveryInstructions && <p className="text-sm"><span className="font-black">Delivery Instructions:</span> {order.address.deliveryInstructions}</p>}
            {hasCoordinates && (
              <a
                href={`https://www.google.com/maps?q=${order.address.latitude},${order.address.longitude}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex text-xs font-black text-accent hover:underline"
              >
                {order.address.latitude}, {order.address.longitude}
              </a>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border/60 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Items</p>
          <div className="space-y-2">
            {safeItems.map((item) => {
              const supplier = getSupplierShortcut(item)
              const customization = normalizeCustomization(item.customization)
              return (
                <div key={`${order.id}-${item.id}-${item.size}-${item.version || "plain"}-${customization.name}-${customization.number}`} className="flex justify-between gap-3 rounded-lg border border-border/60 bg-secondary/20 p-2 text-sm">
                  <div className="min-w-0 space-y-1">
                    <p className="font-black">{item.name} - {item.club} - {item.season}</p>
                    <div className="flex flex-wrap gap-1.5 text-[11px] font-black uppercase tracking-widest">
                      <span className="rounded-md border border-border bg-background px-2 py-1">Size {item.size}</span>
                      <span className="rounded-md border border-border bg-background px-2 py-1">{getJerseyVersionLabel(item.version)}</span>
                      {item.version !== "embroidery" && (
                        <span className={`rounded-md border px-2 py-1 ${customization.mode === "custom" || customization.enabled ? "border-accent bg-accent/10 text-accent" : "border-border bg-background text-muted-foreground"}`}>
                          {isCustomBack(customization)
                            ? `Name: ${customization.name.trim() || "Name"} - Number: ${customization.number.trim() || "00"}`
                            : getJerseyBackLabel(customization)}
                        </span>
                      )}
                      <span className="rounded-md border border-border bg-background px-2 py-1">Qty {item.quantity}</span>
                      <span className="rounded-md border border-border bg-background px-2 py-1">SKU {getShippingSku(item)}</span>
                      {supplier && (
                        <a
                          href={supplier.href}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-accent/40 bg-accent/10 px-2 py-1 text-accent hover:bg-accent hover:text-accent-foreground"
                        >
                          {supplier.label}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                  <span className="font-black whitespace-nowrap">₹{(item.price * item.quantity).toLocaleString("en-IN")}</span>
                </div>
              )
            })}
          </div>
          <div className="border-t border-border/60 mt-3 pt-3 space-y-1 text-sm">
            <div className="flex justify-between"><span>Pieces</span><span>{totalUnits}</span></div>
            <div className="flex justify-between"><span>Parcel weight</span><span>{parcelWeightKg.toFixed(2)} kg</span></div>
            <div className="flex justify-between"><span>Subtotal</span><span>₹{order.subtotal.toLocaleString("en-IN")}</span></div>
            {(order.discount || 0) > 0 && (
              <div className="flex justify-between text-emerald-500 font-bold">
                <span>Discount ({order.couponCode || "Coupon"})</span>
                <span>-₹{(order.discount || 0).toLocaleString("en-IN")}</span>
              </div>
            )}
            <div className="flex justify-between"><span>Delivery</span><span>{order.deliveryCharge === 0 ? "FREE" : `₹${order.deliveryCharge}`}</span></div>
            {(order.convenienceCharge || 0) > 0 && (
              <div className="flex justify-between"><span>COD convenience</span><span>₹{order.convenienceCharge}</span></div>
            )}
            <div className="flex justify-between font-black text-base"><span>Total</span><span>₹{order.total.toLocaleString("en-IN")}</span></div>
            {order.partialCod && (
              <>
                <div className="flex justify-between text-sm font-bold text-emerald-600"><span>Advance paid</span><span>₹{(order.advancePaid || 0).toLocaleString("en-IN")}</span></div>
                <div className="flex justify-between text-sm font-black"><span>Collect on delivery</span><span>₹{(order.codBalance || 0).toLocaleString("en-IN")}</span></div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-border/60 p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Fulfillment Steps</p>
            <div className="flex flex-wrap gap-2">
              <StepButton
                active={displayFulfillmentStatus === "confirmed"}
                icon={<PackageCheck className="w-4 h-4" />}
                label="Confirmed"
                onClick={() => setFulfillment("confirmed")}
                disabled={fulfillmentStatus === "cancelled"}
              />
              <StepButton
                active={displayFulfillmentStatus === "packaged"}
                icon={<PackageCheck className="w-4 h-4" />}
                label="Packed"
                onClick={() => setFulfillment("packaged")}
                disabled={fulfillmentStatus === "cancelled"}
              />
              <StepButton
                active={displayFulfillmentStatus === "shipped"}
                icon={<Truck className="w-4 h-4" />}
                label="In Transit"
                onClick={() => openTrackingFields("shipped")}
                disabled={fulfillmentStatus === "cancelled" || isSendingShippingEmail}
              />
              <StepButton
                active={displayFulfillmentStatus === "out_for_delivery"}
                icon={<Truck className="w-4 h-4" />}
                label="Out for Delivery"
                onClick={() => openTrackingFields("out_for_delivery")}
                disabled={fulfillmentStatus === "cancelled" || isSendingShippingEmail}
              />
              <StepButton
                active={displayFulfillmentStatus === "delivered"}
                icon={<CheckCircle2 className="w-4 h-4" />}
                label="Delivered"
                onClick={() => setFulfillment("delivered")}
                disabled={fulfillmentStatus === "cancelled"}
              />
            </div>
          </div>

        </div>

        {fulfillmentStatus !== "cancelled" && (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              disabled={isSendingShippingEmail}
              onClick={sendStatusEmail}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-accent/30 px-3 text-xs font-black uppercase tracking-widest text-accent hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              {isSendingShippingEmail ? "Sending..." : "Send Email"}
            </button>
          </div>
        )}
        {shippingMessage && (
          <p className="mt-3 text-xs font-bold text-accent">{shippingMessage}</p>
        )}
        {hasCancellationRequest && order.cancellationNote && (
          <p className="mt-2 text-xs text-amber-600">
            Customer cancellation request: <span className="font-black">{order.cancellationNote}</span>
          </p>
        )}
        {fulfillmentStatus === "cancelled" && order.cancellationNote && (
          <p className="mt-2 text-xs text-red-500">
            Cancellation reason: <span className="font-black">{order.cancellationNote}</span>
          </p>
        )}
      </div>
      </div>
      )}
    </div>
  )
}

function InfoCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background/85 p-4 shadow-sm">
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">{icon}</div>
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-black tracking-tight">{value}</p>
    </div>
  )
}

function printOrderInvoice(order: StoreOrder) {
  if (typeof window === "undefined") return
  const printWindow = window.open("", "_blank", "width=1100,height=800")
  if (!printWindow) return
  const patchSummary = getOrderPatchSummary(order)

  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>terrace.fc invoice</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; padding: 0; font-family: Arial, sans-serif; color: #111; }
          .print-frame { position: relative; width: 190mm; min-height: 277mm; margin: 10mm; border: 1.5px solid #111; padding: 5mm 5mm 40mm; }
          .top { display: flex; justify-content: space-between; gap: 18px; border-bottom: 2px solid #111; padding-bottom: 12px; }
          .brand { font-size: 26px; font-weight: 900; letter-spacing: -1px; }
          .brand-dot { color: #ef233c; }
          h1 { margin: 0; font-size: 26px; text-align: right; }
          .order { margin-top: 5px; font-size: 12px; font-weight: 900; text-align: right; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 16px; }
          .box { border: 1px solid #111; padding: 12px; }
          .label { margin-bottom: 8px; color: #111; font-size: 10px; font-weight: 900; letter-spacing: .8px; text-transform: uppercase; }
          .name { margin-bottom: 5px; font-size: 17px; font-weight: 900; }
          .line { font-size: 13px; line-height: 1.55; }
          table { width: 100%; border-collapse: collapse; margin-top: 18px; table-layout: fixed; }
          th { border: 1px solid #111; background: #f3f4f6; padding: 8px; text-align: left; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: .5px; }
          td { border: 1px solid #111; padding: 9px 8px; font-size: 13px; line-height: 1.35; vertical-align: top; overflow-wrap: break-word; }
          th:nth-child(1), td:nth-child(1) { width: 58%; }
          th:nth-child(2), td:nth-child(2) { width: 14%; text-align: center; }
          th:nth-child(3), td:nth-child(3) { width: 10%; text-align: center; }
          th:nth-child(4), td:nth-child(4) { width: 18%; text-align: right; }
          .summary { margin-left: auto; margin-top: 14px; width: 88mm; border: 1px solid #111; }
          .summary-row { display: flex; justify-content: space-between; gap: 12px; padding: 8px 10px; border-bottom: 1px solid #aaa; font-size: 13px; }
          .summary-row:last-child { border-bottom: 0; }
          .total { font-size: 17px; font-weight: 900; background: #fff; color: #000; }
          .signature { position: absolute; right: 5mm; bottom: 10mm; width: 74mm; text-align: center; font-size: 13px; font-weight: 900; }
          .signature-line { border-top: 1.5px solid #111; height: 18mm; margin-top: 0; }
          .signature-label { display: block; margin-top: 4px; }
          .print-footer { position: absolute; left: 5mm; bottom: 3mm; display: flex; align-items: center; gap: 16mm; font-size: 9px; font-weight: 900; letter-spacing: .3px; }
          .print-footer .phone { display: inline-flex; align-items: center; gap: 2mm; }
          .phone-app-icon { display: inline-flex; width: 4.4mm; height: 4.4mm; align-items: center; justify-content: center; border-radius: 1.05mm; background: #000; color: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .phone-app-icon svg { width: 3mm; height: 3mm; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2.7; }
          @page { size: A4; margin: 0; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <main class="print-frame">
        <section class="top">
          <div>
            <div class="brand">terrace<span class="brand-dot">.</span>fc</div>
          </div>
          <div>
            <h1>INVOICE</h1>
            <div class="order">Order ID: ${escapeHtml(getOrderDisplayId(order))}</div>
          </div>
        </section>
        <section class="grid">
          <div class="box">
            <div class="label">Customer</div>
            <div class="name">${escapeHtml(order.address.name)}</div>
            <div class="line"><strong>Phone:</strong> ${escapeHtml(order.address.phone)}</div>
            <div class="line"><strong>Email:</strong> ${escapeHtml(order.address.email)}</div>
          </div>
          <div class="box">
            <div class="label">Courier</div>
            <div class="line"><strong>Courier:</strong> ${escapeHtml(getStickerCourierName(order))}</div>
            <div class="line"><strong>AWB:</strong> ${escapeHtml(getStickerBarcodeValue(order) || "Not assigned")}</div>
          </div>
        </section>
        <table>
          <thead><tr><th>Jersey</th><th>Size</th><th>Qty</th><th>Price</th></tr></thead>
          <tbody>
            ${order.items.map((item) => `
              <tr>
                <td><strong>${escapeHtml(getShippingLabelItemName(item))}</strong>${getShippingLabelItemOptionsHtml(item)}</td>
                <td>${escapeHtml(item.size)}</td>
                <td>${item.quantity}</td>
                <td>₹${(getItemPriceWithoutPatches(item) * item.quantity).toLocaleString("en-IN")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        <section class="summary">
          <div class="summary-row"><span>${patchSummary.total ? "Jersey Subtotal" : "Subtotal"}</span><strong>₹${Math.max(0, order.subtotal - patchSummary.total).toLocaleString("en-IN")}</strong></div>
          ${patchSummary.total ? `<div class="summary-row"><span>${escapeHtml(patchSummary.label)}</span><strong>₹${patchSummary.total.toLocaleString("en-IN")}</strong></div>` : ""}
          <div class="summary-row"><span>Delivery Charges</span><strong>${order.deliveryCharge === 0 ? "FREE" : `₹${order.deliveryCharge.toLocaleString("en-IN")}`}</strong></div>
          ${(order.discount || 0) > 0 ? `<div class="summary-row"><span>Discount${order.couponCode ? ` (${escapeHtml(order.couponCode)})` : ""}</span><strong>-₹${(order.discount || 0).toLocaleString("en-IN")}</strong></div>` : ""}
          ${(order.convenienceCharge || 0) > 0 ? `<div class="summary-row"><span>Convenience Charge</span><strong>₹${(order.convenienceCharge || 0).toLocaleString("en-IN")}</strong></div>` : ""}
          <div class="summary-row total"><span>Total</span><span>₹${order.total.toLocaleString("en-IN")}</span></div>
        </section>
        <div class="signature"><div class="signature-line"></div><span class="signature-label">Authorised signature</span></div>
        <footer class="print-footer"><span class="phone"><span class="phone-app-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.34 1.78.65 2.63a2 2 0 0 1-.45 2.11L8.04 9.73a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.85.31 1.73.53 2.63.65A2 2 0 0 1 22 16.92z" /></svg></span>8147338142</span><span>terracefc.com</span></footer>
        </main>
        <script>window.setTimeout(function () { window.print(); }, 120);</script>
      </body>
    </html>
  `)
  printWindow.document.close()
}

function printOrderStickers(orders: StoreOrder[], orientation: "horizontal" | "vertical") {
  const isHorizontal = orientation === "horizontal"
  const printWindow = window.open("", "_blank", isHorizontal ? "width=1100,height=800" : "width=900,height=1100")
  if (!printWindow) return
  const labelPages = orders.map((order) => orientation === "vertical"
    ? `<section class="print-page vertical-print-page">
        <div class="vertical-label-panel">${stickerHtml(order, orientation)}</div>
        <div class="vertical-cut-line" aria-hidden="true"></div>
        ${verticalInvoiceHtml(order)}
      </section>`
    : `<section class="print-page">${stickerHtml(order, orientation)}</section>`
  ).join("")

  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>terrace.fc Shipping Stickers</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; padding: 0; font-family: Arial, sans-serif; color: #000; overflow-wrap: anywhere; }
          body * { color: #000 !important; }
          .brand-dot { color: #ef233c !important; }
          .sheet { display: block; }
          .print-page { width: 297mm; min-height: 210mm; padding: 10mm; break-after: page; page-break-after: always; display: flex; align-items: center; justify-content: center; }
          .vertical-print-page { min-height: 210mm; padding: 3mm 5mm; display: grid; grid-template-columns: minmax(0,1fr) 0 1fr; column-gap: 5mm; align-items: center; justify-items: center; }
          .vertical-label-panel { width: 100%; height: 204mm; display: flex; align-items: center; justify-content: center; }
          .vertical-cut-line { width: 0; height: 204mm; border-left: 1px dashed #777; }
          .sticker { width: 100%; min-height: ${isHorizontal ? "112mm" : "130mm"}; border: 1.5px solid #111; padding: 4.5mm; overflow: visible; break-inside: avoid; page-break-inside: avoid; display: flex; flex-direction: column; color: #111; }
          .sticker, .sticker * { color: #000; }
          .sticker.horizontal { min-height: 112mm; }
          .sticker.vertical { width: 110mm; height: 150mm; min-height: 150mm; max-width: 110mm; padding: 4mm; overflow: hidden; display: grid; grid-template-rows: auto minmax(0,30mm) minmax(0,26mm) minmax(0,39mm) minmax(0,1fr); }
          .sticker.vertical .sticker-head { margin-bottom: 3px; }
          .sticker.vertical .brand { font-size: 20px; }
          .payment-label { font-size: 11px; font-weight: 400; line-height: 1.15; text-align: right; }
          .sticker.vertical .label { margin: 4px 0 2px; font-size: 10px; letter-spacing: .55px; }
          .sticker.vertical .name { font-size: 18px; line-height: 1.15; }
          .sticker.vertical .line { font-size: 11px; line-height: 1.16; }
          .sticker.vertical .vertical-address .line { font-size: 13px; line-height: 1.2; }
          .sticker.vertical .vertical-address .name { font-size: 20px; line-height: 1.18; }
          .vertical-contact { display: flex; align-items: baseline; justify-content: space-between; gap: 4px; font-size: 10px; line-height: 1.1; white-space: nowrap; }
          .vertical-contact span { overflow: hidden; text-overflow: ellipsis; }
          .sticker.vertical .return-title { font-size: 10px; line-height: 1.2; }
          .sticker.vertical .return-line { font-size: 11px; line-height: 1.1; }
          .sticker.vertical .customer-care { margin-top: 1px; padding-top: 2px; }
          .sticker.vertical .barcode-wrap { margin-top: 3px; }
          .sticker.vertical .barcode { height: 11mm; }
          .sticker.vertical .barcode-text { font-size: 8px; }
          .sticker-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 5px; }
          .brand { font-size: 20px; font-weight: 900; letter-spacing: -1px; line-height: 1; }
          .meta { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 5px 10px; border-top: 1px solid #111; border-bottom: 1px solid #111; padding: 6px 0; font-size: 10px; }
          .meta strong { display: block; margin-top: 2px; font-size: inherit; font-weight: inherit; }
          .order-barcode { width: 100%; margin-top: 4px; }
          .barcode-wrap { width: 100%; max-width: none; margin: 5px 0 0; overflow: visible; }
          .barcode { display: block; width: 100%; height: 10mm; shape-rendering: crispEdges; }
          .barcode-text { margin-top: 2px; font-size: 8px; font-weight: 400; letter-spacing: .04em; text-align: center; line-height: 1; }
          .grid { display: grid; grid-template-columns: ${isHorizontal ? "minmax(0,1.14fr) minmax(0,0.86fr)" : "1fr"}; gap: ${isHorizontal ? "10px" : "0"}; align-items: start; }
          .address-column { min-width: 0; padding-right: 2px; }
          .shipment-column { ${isHorizontal ? "border-left: 1px solid #111; padding-left: 10px;" : "border-top: 1px solid #111; margin-top: 8px; padding-top: 6px;"} }
          .vertical-section { border-top: 1px solid #111; padding: 2px 0; }
          .vertical-split { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 5px; align-items: start; }
          .vertical-right { padding-right: 0; text-align: right; }
          .vertical-right .barcode-wrap { width: 100%; margin-left: 0; margin-right: 0; }
          .vertical-right .barcode-text { text-align: center; }
          .return-contacts { display: grid; gap: 1px; margin-top: 2px; font-size: 8px; line-height: 1.12; text-align: right; }
          .return-contacts span { display: block; }
          .return-contacts-left { text-align: left; font-size: 9px; line-height: 1.15; }
          .vertical-address, .vertical-shipment, .vertical-return { min-height: 0; overflow: hidden; }
          .vertical-items { min-height: 0; margin-top: 0; overflow: hidden; display: grid; grid-template-rows: minmax(0,1fr) auto; }
          .vertical-item-table { width: 100%; min-height: 0; border-collapse: collapse; table-layout: fixed; font-size: 10px; }
          .vertical-item-table th { border-bottom: 1px solid #111; padding: 3px; text-align: left; font-size: 9px; text-transform: uppercase; }
          .vertical-item-table td { border-bottom: 1px solid #aaa; padding: 3px; line-height: 1.25; vertical-align: top; overflow-wrap: break-word; }
          .sticker.vertical .item-options { font-size: 9px; line-height: 1.25; }
          .sticker.vertical .item-summary { position: relative; z-index: 1; flex: none; padding: 3px 6px; background: #fff; }
          .sticker.vertical .item-summary, .sticker.vertical .item-summary .summary-row, .sticker.vertical .item-summary .summary-row span, .sticker.vertical .item-summary .summary-row strong { font-family: Arial, sans-serif; font-size: 10px; line-height: 1.2; font-weight: 400; }
          .sticker.vertical .summary-row.total-row { margin-top: 0; padding-top: 0; }
          .vertical-item-table th:nth-child(1), .vertical-item-table td:nth-child(1) { width: 55%; }
          .vertical-item-table th:nth-child(2), .vertical-item-table td:nth-child(2) { width: 12%; text-align: center; }
          .vertical-item-table th:nth-child(3), .vertical-item-table td:nth-child(3) { width: 13%; text-align: center; }
          .vertical-item-table th:nth-child(4), .vertical-item-table td:nth-child(4) { width: 20%; text-align: right; white-space: nowrap; }
          .vertical-invoice { position: relative; width: 129mm; height: 204mm; max-width: 129mm; border: 1.5px solid #111; padding: 4mm 4mm 24mm; overflow: hidden; }
          .vertical-invoice .vi-top { display: flex; justify-content: space-between; gap: 4mm; border-bottom: 1.5px solid #111; padding-bottom: 3mm; }
          .vertical-invoice .brand { font-size: 20px; }
          .vertical-invoice h1 { margin: 0; font-size: 20px; line-height: 1; text-align: right; }
          .vertical-invoice-order { margin-top: 2mm; font-size: 9px; font-weight: 400; text-align: right; }
          .vertical-invoice .vi-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; margin-top: 3mm; }
          .vertical-invoice .vi-box { border: 1px solid #111; padding: 2.5mm; }
          .vertical-invoice .label { margin: 0 0 2px; font-size: 8px; }
          .vertical-invoice .name { font-size: 13px; }
          .vertical-invoice .line { font-size: 9px; line-height: 1.28; }
          .vertical-invoice-table { width: 100%; margin-top: 3mm; border-collapse: collapse; table-layout: fixed; font-size: 9px; }
          .vertical-invoice-table th { border: 1px solid #111; background: #f3f4f6; padding: 1.5mm; font-size: 7px; text-align: left; text-transform: uppercase; }
          .vertical-invoice-table td { border: 1px solid #111; padding: 1.5mm; line-height: 1.2; vertical-align: top; overflow-wrap: break-word; }
          .vertical-invoice-table th:nth-child(1), .vertical-invoice-table td:nth-child(1) { width: 58%; }
          .vertical-invoice-table th:nth-child(2), .vertical-invoice-table td:nth-child(2) { width: 14%; text-align: center; }
          .vertical-invoice-table th:nth-child(3), .vertical-invoice-table td:nth-child(3) { width: 10%; text-align: center; }
          .vertical-invoice-table th:nth-child(4), .vertical-invoice-table td:nth-child(4) { width: 18%; text-align: right; }
          .vertical-invoice-summary { width: 68mm; margin: 3mm 0 0 auto; border: 1px solid #111; }
          .vertical-invoice-summary .summary-row { padding: 2mm 2.5mm; font-size: 10px; line-height: 1.3; }
          .vertical-invoice-summary .total-row { font-size: inherit; }
          .vertical-invoice-signature { position: absolute; right: 4mm; bottom: 8mm; width: 52mm; text-align: center; font-size: 9px; }
          .vertical-invoice-signature-line { border-top: 1px solid #111; height: 12mm; }
          .vertical-invoice-footer { position: absolute; left: 4mm; bottom: 3mm; font-size: 7px; letter-spacing: .2px; }
          .label { font-size: 9px; text-transform: uppercase; letter-spacing: .8px; color: #555; margin: 8px 0 3px; font-weight: 900; }
          .name { font-size: 18px; line-height: 1.15; font-weight: 900; }
          .line { font-size: 12px; line-height: 1.4; white-space: normal; overflow-wrap: break-word; }
          .contact-line { display: flex; flex-wrap: wrap; gap: 2px 8px; }
          .return-address { margin-top: 7px; border-top: 1px dashed #777; padding-top: 6px; }
          .return-title { font-size: 9px; line-height: 1.25; font-weight: 900; text-transform: uppercase; letter-spacing: .6px; }
          .return-line { font-size: 11px; line-height: 1.35; overflow-wrap: break-word; }
          .customer-care { margin-top: 5px; border-top: 1px solid #111; padding-top: 4px; }
          .items { margin-top: 8px; border: 1px solid #111; }
          .item-head, .item { display: grid; grid-template-columns: minmax(0,1fr) 13mm 18mm 24mm; gap: 5px; align-items: center; padding: 5px; }
          .item-head { border-bottom: 1px solid #111; font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: .5px; }
          .item { font-size: 10px; line-height: 1.25; white-space: normal; }
          .item-options { display: block; margin-top: 2px; font-size: 8px; font-weight: 700; line-height: 1.25; }
          .item + .item { border-top: 1px solid #aaa; }
          .item-number { text-align: right; font-weight: inherit; }
          .item-summary { border-top: 1px solid #111; padding: 5px; }
          .summary-row { display: flex; justify-content: space-between; gap: 10px; font-size: 10px; line-height: 1.5; }
          .summary-row.total-row { margin-top: 0; border-top: 0; padding-top: 0; font-size: inherit; font-weight: inherit; }
          .parcel { display: flex; align-items: baseline; gap: 18px; margin: 4px 0 7px; padding-bottom: 6px; border-bottom: 1px solid #111; font-size: 10px; }
          .parcel-value { margin-left: 4px; font-size: inherit; line-height: inherit; font-weight: inherit; }
          .sticker .line strong, .sticker .summary-row strong, .vertical-invoice-summary strong { font-weight: inherit; }
          .awb { margin-top: 6px; }
          @page { size: A4 landscape; margin: 0; }
          @media print {
            body { padding: 0; }
            .sticker.vertical { width: 110mm; height: 150mm; max-width: 110mm; }
            .vertical-print-page { min-height: 210mm; }
            .print-page:last-child { break-after: auto; page-break-after: auto; }
          }
        </style>
      </head>
      <body>
        <div class="sheet">
          ${labelPages}
        </div>
        <script>window.print();</script>
      </body>
    </html>
  `)
  printWindow.document.close()
}

function stickerHtml(order: StoreOrder, orientation: "horizontal" | "vertical") {
  const totalUnits = order.items.reduce((sum, item) => sum + item.quantity, 0)
  const parcelWeightKg = calculateOrderWeightKg(order)
  const patchSummary = getOrderPatchSummary(order)
  const addressLines = [
    order.address.address,
    `${order.address.city}, ${order.address.state} - ${order.address.pincode}`,
  ].filter((line): line is string => Boolean(line))

  if (orientation === "vertical") {
    return verticalStickerHtml(order, totalUnits, parcelWeightKg, addressLines)
  }

  return `
    <div class="sticker ${orientation}">
      <div class="sticker-head">
        <div class="brand">terrace<span class="brand-dot">.</span>fc</div>
        <span class="payment-label">${getShippingPaymentLabel(order)}</span>
      </div>
      <div class="meta">
        <span>Order ID<strong>${escapeHtml(getShiprocketDisplayOrderId(order))}</strong></span>
        <span>Invoice<strong>${escapeHtml(getOrderInvoiceNumber(order))}</strong></span>
        <span>Order Date<strong>${escapeHtml(formatShiprocketLabelDate(order.shiprocketOrderDate || order.createdAt))}</strong></span>
      </div>
      <div class="grid">
        <section class="address-column">
          <div class="label">Ship To</div>
           <div class="name">${escapeHtml(order.address.name)}</div>
           <div class="line contact-line"><span>${escapeHtml(order.address.phone)}</span><span>${escapeHtml(order.address.email)}</span></div>
           ${order.address.houseNumber ? `<div class="line"><strong>Flat / Floor:</strong> ${escapeHtml(order.address.houseNumber)}</div>` : ""}
           ${addressLines.map((line) => `<div class="line">${escapeHtml(line)}</div>`).join("")}
           ${order.address.deliveryInstructions ? `<div class="line"><strong>Delivery Instructions:</strong> ${escapeHtml(order.address.deliveryInstructions)}</div>` : ""}
           <div class="return-address">
             <div class="return-title">terrace.fc (Return to this address if not delivered)</div>
             <div class="return-line">Villa 51, R K Garden, Bluejay Malgudi Villas, Sy.No 85, 1st Cross, Opp. Holiday Village Resort, Anjanapura Village, Uttarahalli Hobli, Bengaluru, Karnataka 560109</div>
             <div class="return-line"><strong>Primary:</strong> 8147338142 | <strong>Secondary:</strong> 9686616796</div>
             <div class="return-line customer-care">${getShippingCustomerCareHtml(order)}</div>
           </div>
        </section>
        <section class="shipment-column">
          <div class="parcel">
            <span>Weight<span class="parcel-value">${parcelWeightKg.toFixed(2)} kg</span></span>
            <span>Pieces<span class="parcel-value">${totalUnits}</span></span>
          </div>
          <div class="order-barcode">
            <div class="label">Order ID</div>
            ${barcodeHtml(getShiprocketDisplayOrderId(order), "code128")}
          </div>
          <div class="awb">
            <div class="label">AWB: ${escapeHtml(getStickerCourierName(order))}</div>
            ${barcodeHtml(getStickerBarcodeValue(order), "code128")}
          </div>
          <div class="items">
            <div class="item-head"><span>Items</span><span style="text-align:right">Size</span><span style="text-align:right">Quantity</span><span style="text-align:right">Price</span></div>
            ${order.items.map((item) => {
              return `<div class="item"><span><strong>${escapeHtml(getShippingLabelItemName(item))}</strong>${getShippingLabelItemOptionsHtml(item)}</span><span class="item-number">${escapeHtml(item.size)}</span><span class="item-number">${item.quantity}</span><span class="item-number">₹${(getItemPriceWithoutPatches(item) * item.quantity).toLocaleString("en-IN")}</span></div>`
            }).join("")}
            <div class="item-summary">
              <div class="summary-row"><span>${patchSummary.total ? "Jersey Subtotal" : "Subtotal"}</span><strong>₹${Math.max(0, order.subtotal - patchSummary.total).toLocaleString("en-IN")}</strong></div>
              ${patchSummary.total ? `<div class="summary-row"><span>${escapeHtml(patchSummary.label)}</span><strong>₹${patchSummary.total.toLocaleString("en-IN")}</strong></div>` : ""}
              <div class="summary-row"><span>Delivery Charges</span><strong>${order.deliveryCharge === 0 ? "FREE" : `₹${order.deliveryCharge.toLocaleString("en-IN")}`}</strong></div>
              ${(order.discount || 0) > 0 ? `<div class="summary-row"><span>Discount${order.couponCode ? ` (${escapeHtml(order.couponCode)})` : ""}</span><strong>-₹${(order.discount || 0).toLocaleString("en-IN")}</strong></div>` : ""}
              ${(order.convenienceCharge || 0) > 0 ? `<div class="summary-row"><span>Convenience Charge</span><strong>₹${(order.convenienceCharge || 0).toLocaleString("en-IN")}</strong></div>` : ""}
              <div class="summary-row total-row"><span>Total</span><span>₹${order.total.toLocaleString("en-IN")}</span></div>
            </div>
          </div>
        </section>
      </div>
    </div>
  `
}

function verticalStickerHtml(order: StoreOrder, totalUnits: number, parcelWeightKg: number, addressLines: string[]) {
  const patchSummary = getOrderPatchSummary(order)

  return `
    <div class="sticker vertical">
      <div class="sticker-head">
        <div class="brand">terrace<span class="brand-dot">.</span>fc</div>
        <span class="payment-label">${getShippingPaymentLabel(order)}</span>
      </div>

      <section class="vertical-address">
        <div class="label">Ship To</div>
        <div class="name">${escapeHtml(order.address.name)}</div>
        ${order.address.houseNumber ? `<div class="line"><strong>Flat / Floor:</strong> ${escapeHtml(order.address.houseNumber)}</div>` : ""}
        ${addressLines.map((line) => `<div class="line">${escapeHtml(line)}</div>`).join("")}
        ${order.address.deliveryInstructions ? `<div class="line"><strong>Instructions:</strong> ${escapeHtml(order.address.deliveryInstructions)}</div>` : ""}
        <div class="vertical-contact"><strong>${escapeHtml(order.address.phone)}</strong><span>${escapeHtml(order.address.email)}</span></div>
      </section>

      <section class="vertical-section vertical-shipment vertical-split">
        <div>
          <div class="return-title">Shipment Details</div>
          <div class="line"><strong>AWB:</strong> ${escapeHtml(getStickerBarcodeValue(order))}</div>
          <div class="line"><strong>Courier:</strong> ${escapeHtml(getStickerCourierName(order))}</div>
          <div class="line"><strong>Weight:</strong> ${parcelWeightKg.toFixed(2)} kg &nbsp;·&nbsp; <strong>Pieces:</strong> ${totalUnits}</div>
          <div class="line"><strong>Payment:</strong> ${order.partialCod ? "PARTIAL COD" : order.status === "cod" ? "COD" : "PREPAID"}</div>
          <div class="line"><strong>Order Total:</strong> ₹${order.total.toLocaleString("en-IN")}</div>
        </div>
        <div class="vertical-right">
          <div class="label" style="margin-top:0">AWB Barcode</div>
          ${barcodeHtml(getStickerBarcodeValue(order), "code128")}
        </div>
      </section>

      <section class="vertical-section vertical-return vertical-split">
        <div>
          <div class="return-title">Shipped By (if undelivered, return to)</div>
          <div class="line"><strong>terrace.fc</strong></div>
          <div class="return-line">Villa 51, R K Garden, Bluejay Malgudi Villas, Sy.No 85, 1st Cross, Opp. Holiday Village Resort, Anjanapura Village, Uttarahalli Hobli, Bengaluru, Karnataka 560109</div>
          <div class="return-contacts return-contacts-left"><span><strong>Primary:</strong> 8147338142</span><span><strong>Secondary:</strong> 9686616796</span></div>
        </div>
        <div class="vertical-right">
          <div class="label" style="margin-top:0">Order ID: ${escapeHtml(getShiprocketDisplayOrderId(order))}</div>
          ${barcodeHtml(getShiprocketDisplayOrderId(order), "code128")}
          <div class="return-contacts"><span>${getShippingCustomerCareHtml(order)}</span></div>
        </div>
      </section>

      <div class="items vertical-items">
        <table class="vertical-item-table">
          <thead>
            <tr><th>Items</th><th>Size</th><th>Qty</th><th>Price</th></tr>
          </thead>
          <tbody>
            ${order.items.map((item) => `
              <tr>
                <td><strong>${escapeHtml(getShippingLabelItemName(item))}</strong>${getShippingLabelItemOptionsHtml(item)}</td>
                <td>${escapeHtml(item.size)}</td>
                <td>${item.quantity}</td>
                <td>₹${(getItemPriceWithoutPatches(item) * item.quantity).toLocaleString("en-IN")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        <div class="item-summary">
          <div class="summary-row"><span>${patchSummary.total ? "Jersey Subtotal" : "Subtotal"}</span><strong>₹${Math.max(0, order.subtotal - patchSummary.total).toLocaleString("en-IN")}</strong></div>
          ${patchSummary.total ? `<div class="summary-row"><span>${escapeHtml(patchSummary.label)}</span><strong>₹${patchSummary.total.toLocaleString("en-IN")}</strong></div>` : ""}
          <div class="summary-row"><span>Delivery Charges</span><strong>${order.deliveryCharge === 0 ? "FREE" : `₹${order.deliveryCharge.toLocaleString("en-IN")}`}</strong></div>
          ${(order.discount || 0) > 0 ? `<div class="summary-row"><span>Discount${order.couponCode ? ` (${escapeHtml(order.couponCode)})` : ""}</span><strong>-₹${(order.discount || 0).toLocaleString("en-IN")}</strong></div>` : ""}
          <div class="summary-row total-row"><span>Total</span><span>₹${order.total.toLocaleString("en-IN")}</span></div>
        </div>
      </div>
    </div>
  `
}

function verticalInvoiceHtml(order: StoreOrder) {
  const patchSummary = getOrderPatchSummary(order)

  return `
    <aside class="vertical-invoice">
      <section class="vi-top">
        <div class="brand">terrace<span class="brand-dot">.</span>fc</div>
        <div>
          <h1>INVOICE</h1>
          <div class="vertical-invoice-order">Order ID: ${escapeHtml(getOrderDisplayId(order))}</div>
          <div class="vertical-invoice-order">Invoice: ${escapeHtml(getOrderInvoiceNumber(order))}</div>
        </div>
      </section>
      <section class="vi-grid">
        <div class="vi-box">
          <div class="label">Customer</div>
          <div class="name">${escapeHtml(order.address.name)}</div>
          <div class="line"><strong>Phone:</strong> ${escapeHtml(order.address.phone)}</div>
          <div class="line"><strong>Email:</strong> ${escapeHtml(order.address.email)}</div>
        </div>
        <div class="vi-box">
          <div class="label">Courier</div>
          <div class="line"><strong>Courier:</strong> ${escapeHtml(getStickerCourierName(order))}</div>
          <div class="line"><strong>AWB:</strong> ${escapeHtml(getStickerBarcodeValue(order) || "Not assigned")}</div>
        </div>
      </section>
      <table class="vertical-invoice-table">
        <thead><tr><th>Jersey</th><th>Size</th><th>Qty</th><th>Price</th></tr></thead>
        <tbody>
          ${order.items.map((item) => `
            <tr>
              <td><strong>${escapeHtml(getShippingLabelItemName(item))}</strong>${getShippingLabelItemOptionsHtml(item)}</td>
              <td>${escapeHtml(item.size)}</td>
              <td>${item.quantity}</td>
              <td>₹${(getItemPriceWithoutPatches(item) * item.quantity).toLocaleString("en-IN")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      <section class="vertical-invoice-summary">
        <div class="summary-row"><span>${patchSummary.total ? "Jersey Subtotal" : "Subtotal"}</span><strong>₹${Math.max(0, order.subtotal - patchSummary.total).toLocaleString("en-IN")}</strong></div>
        ${patchSummary.total ? `<div class="summary-row"><span>${escapeHtml(patchSummary.label)}</span><strong>₹${patchSummary.total.toLocaleString("en-IN")}</strong></div>` : ""}
        <div class="summary-row"><span>Delivery</span><strong>${order.deliveryCharge === 0 ? "FREE" : `₹${order.deliveryCharge.toLocaleString("en-IN")}`}</strong></div>
        ${(order.discount || 0) > 0 ? `<div class="summary-row"><span>Discount</span><strong>-₹${(order.discount || 0).toLocaleString("en-IN")}</strong></div>` : ""}
        <div class="summary-row total-row"><span>Total</span><span>₹${order.total.toLocaleString("en-IN")}</span></div>
      </section>
      <div class="vertical-invoice-signature"><div class="vertical-invoice-signature-line"></div><span>Authorised signature</span></div>
      <footer class="vertical-invoice-footer">8147338142 &nbsp;|&nbsp; terracefc.com</footer>
    </aside>
  `
}

function getStickerBarcodeValue(order: StoreOrder) {
  return order.delhiveryWaybill || order.trackingNumber || order.shippingId || ""
}

function getDelhiveryOneUrl(order: StoreOrder) {
  const awb = order.delhiveryWaybill || (order.shippingProvider === "delhivery" ? order.trackingNumber || order.shippingId : "")
  return awb ? `https://one.delhivery.com/shipments/forward/${encodeURIComponent(awb)}` : ""
}

function getStickerCourierName(order: StoreOrder) {
  return "Delhivery"
}

function getShiprocketDisplayOrderId(order: StoreOrder) {
  return getOrderDisplayId(order)
}

function getOrderInvoiceNumber(order: StoreOrder) {
  return order.shiprocketInvoiceNumber || `INV-${getOrderDisplayId(order)}`
}

function getShippingCustomerCareHtml(order: StoreOrder) {
  if (order.shippingProvider === "delhivery" || order.delhiveryWaybill || (order.courierName || "").toLowerCase().includes("delhivery")) {
    return "<strong>Delhivery Customer Care:</strong> help.delhivery.com"
  }

  return "<strong>Courier:</strong> Manual shipping"
}

function getSupplierShortcut(item: StoreOrder["items"][number]) {
  const text = `${item.name} ${item.club} ${item.season}`.toLowerCase()
  if (text.includes("formula 1") || text.includes("f1") || ["ferrari", "mercedes", "mclaren", "red bull", "racing bulls"].some((brand) => text.includes(brand))) {
    return { label: "Shark Shirts", href: "https://www.instagram.com/sharkshirts.in/" }
  }
  if (text.includes("kids") || text.includes("kid ")) {
    return { label: "Topfootball", href: "https://www.topfootball.in/" }
  }
  return null
}

function getShippingLabelItemName(item: StoreOrder["items"][number]) {
  const season = item.season.replace(/\s*-\s*short sleeve/gi, "").trim()
  const baseJersey = [item.club, season].filter(Boolean).join(" ")
  if (isCustomBack(item.customization)) {
    return [getCustomPrintLabel(item.customization), baseJersey].filter(Boolean).join(" - ")
  }
  return [item.name.replace(/\s*Jr\.?$/i, ""), baseJersey].filter(Boolean).join(" ")
}

function getShippingLabelItemOptionsHtml(item: StoreOrder["items"][number]) {
  const customization = item.customization
  const options: string[] = []

  if (isCustomBack(customization)) {
    options.push(`Name & No: ${getCustomPrintLabel(customization)}`)
  } else if (customization?.mode === "original") {
    options.push("Original player name")
  }

  if (customization?.patches) {
    const patchType = typeof customization.patchType === "string" ? customization.patchType.trim() : ""
    options.push(`Patches: ${patchType || "Sleeve patches"}`)
  }

  return options.length ? `<span class="item-options">${escapeHtml(options.join(" | "))}</span>` : ""
}

function getItemPriceWithoutPatches(item: StoreOrder["items"][number]) {
  return Math.max(0, Number(item.price || 0) - (item.customization?.patches ? PATCHES_PRICE : 0))
}

function getOrderPatchSummary(order: StoreOrder) {
  const patchedItems = order.items.filter((item) => item.customization?.patches)
  const total = patchedItems.reduce((sum, item) => sum + PATCHES_PRICE * Math.max(1, Number(item.quantity || 1)), 0)
  const types = Array.from(new Set(patchedItems.map((item) => {
    const patchType = item.customization?.patchType
    return typeof patchType === "string" ? patchType.trim() : ""
  }).filter(Boolean)))

  return {
    total,
    label: `Patches${types.length ? ` (${types.join(", ")})` : ""}`,
  }
}

function calculateOrderWeightKg(order: StoreOrder) {
  const totalWeightKg = order.items.reduce((sum, item) => {
    const quantity = Math.max(0, Number(item.quantity || 0))
    const version = String(item.version || "").toLowerCase()
    const isMaster = version === "master" || /master/.test(String(item.name || "").toLowerCase())
    return sum + quantity * (isMaster ? 0.3 : 0.2)
  }, 0)
  return Math.max(0.2, Number(totalWeightKg.toFixed(2)))
}

function getFulfillmentStatusFromSubPhase(value: string): StoreOrder["fulfillmentStatus"] | null {
  const text = value.toLowerCase()
  if (text.includes("delivered")) return "delivered"
  if (text.includes("out for delivery") || text.includes("ofd")) return "out_for_delivery"
  if (text.includes("picked")) return "shipped"
  if (
    text.includes("received") ||
    text.includes("departed") ||
    text.includes("arrived") ||
    text.includes("bag") ||
    text.includes("trip") ||
    text.includes("facility") ||
    text.includes("origin") ||
    text.includes("transit")
  ) return "shipped"
  return null
}

function formatShiprocketLabelDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value || "Not provided"
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function barcodeHtml(value: string, format: "code39" | "code128") {
  if (format === "code39") return code39BarcodeHtml(value)

  const readableValue = value.toUpperCase().replace(/[^\x20-\x7E]/g, "").slice(0, 30)
  // Use the standard printable Code 128 character set. This produces the same
  // dense, thin-bar appearance as the approved label reference.
  const startCode = 104
  const codeValues = [...readableValue].map((character) => character.charCodeAt(0) - 32)
  const checksum = (startCode + codeValues.reduce((sum, code, index) => sum + code * (index + 1), 0)) % 103
  const encoded = [startCode, ...codeValues, checksum, 106]
  const quietZone = 10
  const barHeight = 60
  let x = quietZone
  const bars = encoded.map((code) => {
    const pattern = CODE128_PATTERNS[code]
    return [...pattern].map((unit, index) => {
      const width = Number(unit)
      const rect = index % 2 === 0 ? `<rect x="${x}" y="0" width="${width}" height="${barHeight}" fill="#000" />` : ""
      x += width
      return rect
    }).join("")
  }).join("")

  return `
    <div class="barcode-wrap" aria-label="Order barcode">
      <svg class="barcode" viewBox="0 0 ${x + quietZone} ${barHeight}" preserveAspectRatio="none" role="img" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${x + quietZone}" height="${barHeight}" fill="#fff" />
        ${bars}
      </svg>
      <div class="barcode-text">${escapeHtml(readableValue)}</div>
    </div>
  `
}

function code39BarcodeHtml(value: string) {
  const readableValue = value.toUpperCase().replace(/[^A-Z0-9-. $/+%]/g, "")
  const scanValue = readableValue.slice(0, 42)
  const encoded = `*${scanValue}*`
  const barHeight = 44
  let x = 18
  const bars = encoded.split("").map((character) => {
    const pattern = CODE39_PATTERNS[character] || CODE39_PATTERNS["-"]
    const rects = pattern.split("").map((unit, index) => {
      const width = unit === "w" ? 10 : 4
      const rect = index % 2 === 0 ? `<rect x="${x}" y="0" width="${width}" height="${barHeight}" fill="#000" />` : ""
      x += width
      return rect
    }).join("")
    x += 4
    return rects
  }).join("")

  return `
    <div class="barcode-wrap" aria-label="Order barcode">
      <svg class="barcode" viewBox="0 0 ${x + 18} ${barHeight}" preserveAspectRatio="none" role="img" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${x + 18}" height="${barHeight}" fill="#fff" />
        ${bars}
      </svg>
      <div class="barcode-text">${escapeHtml(readableValue)}</div>
    </div>
  `
}

const CODE39_PATTERNS: Record<string, string> = {
  "0": "nnnwwnwnn", "1": "wnnwnnnnw", "2": "nnwwnnnnw", "3": "wnwwnnnnn", "4": "nnnwwnnnw", "5": "wnnwwnnnn", "6": "nnwwwnnnn", "7": "nnnwnnwnw", "8": "wnnwnnwnn", "9": "nnwwnnwnn",
  A: "wnnnnwnnw", B: "nnwnnwnnw", C: "wnwnnwnnn", D: "nnnnwwnnw", E: "wnnnwwnnn", F: "nnwnwwnnn", G: "nnnnnwwnw", H: "wnnnnwwnn", I: "nnwnnwwnn", J: "nnnnwwwnn", K: "wnnnnnnww", L: "nnwnnnnww", M: "wnwnnnnwn", N: "nnnnwnnww", O: "wnnnwnnwn", P: "nnwnwnnwn", Q: "nnnnnnwww", R: "wnnnnnwwn", S: "nnwnnnwwn", T: "nnnnwnwwn", U: "wwnnnnnnw", V: "nwwnnnnnw", W: "wwwnnnnnn", X: "nwnnwnnnw", Y: "wwnnwnnnn", Z: "nwwnwnnnn",
  "-": "nwnnnnwnw", ".": "wwnnnnwnn", " ": "nwwnnnwnn", "$": "nwnwnwnnn", "/": "nwnwnnnwn", "+": "nwnnnwnwn", "%": "nnnwnwnwn", "*": "nwnnwnwnn",
}

const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313", "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111", "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
] as const

function StepButton({
  active,
  disabled,
  icon,
  label,
  onClick,
}: {
  active: boolean
  disabled?: boolean
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-black uppercase tracking-widest transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        active ? "border-accent bg-accent/10 text-accent" : "border-border hover:bg-secondary"
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function getOrderStatusLabel(status: StoreOrder["status"]) {
  if (status === "paid") return "Paid"
  if (status === "cod") return "COD"
  return "Test Order"
}

function getShippingPaymentLabel(order: StoreOrder) {
  if (order.partialCod) return `PARTIAL COD - COLLECT ₹${(order.codBalance || 0).toLocaleString("en-IN")}`
  if (order.status === "cod") return `COD - COLLECT ₹${order.total.toLocaleString("en-IN")}`
  return "PREPAID (DO NOT COLLECT MONEY)"
}

function getOrderStatusClass(status: StoreOrder["status"]) {
  if (status === "paid") return "bg-emerald-500/10 text-emerald-600"
  if (status === "cod") return "bg-blue-500/10 text-blue-600"
  return "bg-amber-500/10 text-amber-600"
}

function getOrderItemVersionLabel(item: { version?: string }) {
  if (item.version === "player") return "Player Version"
  if (item.version === "fan") return "Fan Version"
  return "Plain Version"
}

function getOrderItemCustomizationLabel(item: StoreOrder["items"][number]) {
  const customization = normalizeCustomization(item.customization)
  if (!customization.enabled) return "No Customization"

  const name = customization.name.trim() || "NAME"
  const number = customization.number.trim() || "00"
  return `Custom: ${name} #${number}`
}

function normalizeCustomization(customization: StoreOrder["items"][number]["customization"]) {
  return {
    enabled: Boolean(customization?.enabled),
    mode: customization?.mode || "plain",
    name: String(customization?.name || ""),
    number: String(customization?.number || ""),
    patches: Boolean(customization?.patches),
    patchType: String(customization?.patchType || "").trim() || undefined,
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

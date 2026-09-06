import type { StoreOrder } from "@/lib/orders"

export const ORDER_STATUS_STEPS: Array<NonNullable<StoreOrder["fulfillmentStatus"]>> = [
  "confirmed",
  "packaged",
  "shipped",
  "out_for_delivery",
  "delivered",
]

export function getOrderStatusLabel(status?: StoreOrder["fulfillmentStatus"]) {
  if (status === "processing") return "Confirmed"
  if (status === "confirmed") return "Confirmed"
  if (status === "packaged") return "Packed"
  if (status === "picked_up") return "In Transit"
  if (status === "shipped") return "In Transit"
  if (status === "out_for_delivery") return "Out for Delivery"
  if (status === "delivered") return "Delivered"
  if (status === "failed_to_ship") return "Failed to Ship"
  if (status === "cancelled") return "Cancelled"
  return "Confirmed"
}

export function getOrderStatusMessage(status?: StoreOrder["fulfillmentStatus"]) {
  if (status === "processing") return "Your order has been confirmed."
  if (status === "confirmed") return "Your order has been confirmed."
  if (status === "packaged") return "Your order has been packed and is being prepared for shipment."
  if (status === "picked_up") return "Your order is in transit."
  if (status === "shipped") return "Your order is in transit. You can track delivery progress below."
  if (status === "out_for_delivery") return "Your order is out for delivery and should arrive soon."
  if (status === "delivered") return "Your order has been delivered."
  if (status === "failed_to_ship") return "The courier could not complete delivery. You can confirm your address and pay the re-shipping fee to have it sent again."
  if (status === "cancelled") return "Your order has been cancelled."
  return "Your order has been confirmed."
}

export type TrackingScan = {
  status?: string
  location?: string
  date?: string
}

/** Resolve the main fulfillment phase from the newest carrier scan. Carrier
 * headline text often remains "Manifested" after movement has started, so
 * scans are the authoritative live source for both admin and customer views. */
export function getLiveFulfillmentStatus(
  savedStatus: StoreOrder["fulfillmentStatus"] | undefined,
  scans: TrackingScan[] = [],
  headline?: string,
): NonNullable<StoreOrder["fulfillmentStatus"]> {
  const normalizedSaved = savedStatus === "processing" ? "confirmed" : savedStatus || "confirmed"
  const text = `${headline || ""} ${scans.map((scan) => `${scan.status || ""} ${scan.location || ""}`).join(" ")}`.toLowerCase()
  if (text.includes("delivered")) return "delivered"
  if (text.includes("out for delivery") || text.includes("ofd")) return "out_for_delivery"
  if (text.includes("transit") || text.includes("picked") || text.includes("pickup") || text.includes("bagged") || text.includes("received") || text.includes("departed") || text.includes("arrived") || text.includes("reached") || text.includes("dispatched")) return "shipped"
  return normalizedSaved
}

const PHASE_KEYWORDS: Record<string, string[]> = {
  picked_up: ["picked", "pickup", "pick up", "warehouse", "manifested"],
  shipped: ["in transit", "transit", "bagged", "received", "facility", "hub", "scan", "connected", "departed", "arrived", "reached", "dispatched", "picked", "pickup", "booked", "post office", "warehouse", "origin"],
  out_for_delivery: ["out for delivery", "ofd", "with delivery"],
  delivered: ["delivered"],
  failed_to_ship: ["failed", "exception", "undelivered", "rto"],
}

export function getTrackingSubPhases(
  fulfillmentStatus?: StoreOrder["fulfillmentStatus"],
  scans: TrackingScan[] = [],
  fallbackStatus?: string,
) {
  const currentStatus = fulfillmentStatus === "processing" ? "confirmed" : fulfillmentStatus || "confirmed"
  const keywords = PHASE_KEYWORDS[currentStatus] || []
  if (!keywords.length) return []

  const normalizedFallback = normalizeTrackingText(fallbackStatus)
  const scanList = scans.length
    ? scans
    : normalizedFallback
      ? [{ status: fallbackStatus || "", location: "", date: "" }]
      : []

  return scanList
    .filter((scan) => {
      const text = normalizeTrackingText(`${scan.status || ""} ${scan.location || ""}`)
      if (!text) return false
      // Delhivery emits these as internal pre-pickup events; never show them
      // as customer/admin movement sub-phases.
      if (/not picked|not ready|manifested|manifest uploaded|package details changed/.test(text)) return false
      // Out-for-delivery and delivered are main phases, not transit details.
      // Keep their carrier timestamps beside their own phase in the timeline.
      if (currentStatus === "shipped" && /out for delivery|\bofd\b|delivered|undelivered|return to origin|\brto\b/.test(text)) return false
      // In transit history should mirror the carrier response exactly; keep
      // valid operational scans such as weight capture, bagging, departure,
      // and arrival even when their wording is not in the keyword list.
      return currentStatus === "shipped" ? true : keywords.some((keyword) => text.includes(keyword))
    })
}

function normalizeTrackingText(value?: string) {
  return (value || "").trim().toLowerCase()
}

export function getCourierTrackingUrl(courierName?: string, trackingNumber?: string) {
  const tracking = trackingNumber?.trim()
  if (!tracking) return null

  const courier = courierName?.trim().toLowerCase() || ""
  if (courier.includes("delhivery")) {
    return `https://www.delhivery.com/track/package/${encodeURIComponent(tracking)}`
  }

  if (courier.includes("blue dart") || courier.includes("bluedart")) {
    return `https://www.bluedart.com/web/guest/trackdartresult?trackFor=0&trackNo=${encodeURIComponent(tracking)}`
  }
  if (courier.includes("borzo")) {
    return tracking.startsWith("http") ? tracking : null
  }
  if (courier.includes("india post") || courier.includes("speed post")) {
    return `https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx?tracking_number=${encodeURIComponent(tracking)}`
  }

  return null
}

export function getOrderPageUrl(orderId: string) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL
  const origin = configured || "https://www.terracefc.com"
  return `${origin.replace(/\/$/, "")}/orders/${encodeURIComponent(orderId)}`
}

export function formatExpectedDelivery(value?: string) {
  const raw = value?.trim()
  if (!raw) return "Not available yet"

  // Delhivery sometimes returns a relative estimate (for example, "2 days").
  // Turn that into a concrete date so customers and admins see the same ETA.
  const relative = raw.match(/^(?:in\s*)?(\d+)\s*days?$/i)
  if (relative) {
    const days = Number(relative[1])
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() + days)
    return `${days} day${days === 1 ? "" : "s"} ( ${date.toLocaleDateString("en-IN", { month: "long", day: "numeric" })} )`
  }

  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(raw)
  if (Number.isNaN(date.getTime())) return raw

  const today = new Date()
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const startDelivery = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const differenceInDays = Math.round((startDelivery.getTime() - startToday.getTime()) / 86_400_000)

  if (differenceInDays === 0) return "Today"
  if (differenceInDays === 1) return "Tomorrow"
  return date.toLocaleDateString("en-IN", { month: "long", day: "numeric" })
}

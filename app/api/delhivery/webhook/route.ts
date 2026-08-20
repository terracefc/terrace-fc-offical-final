import { NextResponse } from "next/server"
import { sendEmail } from "@/lib/email"
import { failedShipmentEmailHtml, orderStatusEmailHtml, orderStatusEmailSubject } from "@/lib/order-status-email"
import { readStoredOrders, updateStoredOrder } from "@/lib/order-storage"
import { getOrderDisplayId, mapOrderRow, type StoreOrder } from "@/lib/orders"
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  }

  const payload = await request.json().catch(() => null)
  const waybill = getPayloadText(payload, ["waybill", "wbn", "awb", "awb_no", "awb_number", "tracking_number"])
  const pickupId = getPayloadText(payload, ["pickup_id", "pickupId", "pickup_request_id", "pickupRequestId", "pickup_id_pk", "pickup", "manifest_id", "manifestId"])
  const orderId = getPayloadText(payload, ["order_id", "orderId", "reference_no", "refnum", "client_order_id"])
  const status = getPayloadText(payload, ["status", "Status", "shipment_status", "current_status", "scan", "Scan"])
  const statusType = getPayloadText(payload, ["status_type", "StatusType", "scan_type"])
  const instructions = getPayloadText(payload, ["instructions", "Instructions", "remarks", "description", "scan_remark", "activity"])
  const location = getPayloadText(payload, ["location", "ScannedLocation", "scan_location", "city", "center"])
  const estimatedDelivery = getPayloadText(payload, ["promised_delivery_date", "PromisedDeliveryDate", "expected_delivery_date", "ExpectedDeliveryDate", "edd", "etd"])
  const scanTime = getPayloadText(payload, ["scan_time", "ScanDateTime", "event_time", "timestamp", "updated_at"])
  const fulfillmentStatus = mapDelhiveryWebhookStatus(`${status} ${statusType} ${instructions}`)

  if (!waybill && !orderId && !pickupId) {
    return NextResponse.json({ ok: true, ignored: true, reason: "No AWB, pickup id, or order id in webhook." })
  }

  const order = await findOrder(orderId, waybill, pickupId)
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 })
  if (order.fulfillmentStatus === "cancelled") return NextResponse.json({ ok: true, ignored: true, cancelled: true })
  const delhiveryScans = mergeDelhiveryScans(order.delhiveryScans || [], {
    status: status || instructions || statusType,
    location,
    date: normalizeDate(scanTime) || scanTime,
  })

  const delhiveryStatus = [status || instructions, location ? `at ${location}` : ""].filter(Boolean).join(" ")
  if (!fulfillmentStatus) {
    const scanOnlyUpdates: Partial<StoreOrder> = {
      delhiveryStatus: delhiveryStatus || order.delhiveryStatus,
      delhiveryScans,
      delhiveryError: "",
      delhiveryPickupId: pickupId || order.delhiveryPickupId,
      delhiveryWaybill: waybill || order.delhiveryWaybill,
      trackingNumber: waybill || order.trackingNumber || order.shippingId,
      shippingId: waybill || order.shippingId || order.trackingNumber,
      courierName: "Delhivery",
      shippingProvider: "delhivery",
      estimatedDelivery: estimatedDelivery || order.estimatedDelivery,
    }
    const scanChanged =
      Boolean(delhiveryStatus && delhiveryStatus !== order.delhiveryStatus) ||
      Boolean(pickupId && pickupId !== order.delhiveryPickupId) ||
      Boolean(estimatedDelivery && estimatedDelivery !== order.estimatedDelivery) ||
      JSON.stringify(delhiveryScans) !== JSON.stringify(order.delhiveryScans || [])
    if (!scanChanged) {
      return NextResponse.json({ ok: true, ignored: true, waybill, status: status || instructions })
    }
    await saveOrderUpdates(order.id, scanOnlyUpdates)
    // Initial courier scans are covered by the invoice confirmation. Only
    // send a separate update once the delivery reaches a real later stage.
    return NextResponse.json({ ok: true, orderId: order.id, scanOnly: true, delhiveryStatus, emailSent: false })
  }

  const updates: Partial<StoreOrder> = {
    fulfillmentStatus,
    delhiveryStatus: delhiveryStatus || order.delhiveryStatus,
    delhiveryScans,
    delhiveryError: "",
    delhiveryPickupId: pickupId || order.delhiveryPickupId,
    delhiveryWaybill: waybill || order.delhiveryWaybill,
    trackingNumber: waybill || order.trackingNumber || order.shippingId,
    shippingId: waybill || order.shippingId || order.trackingNumber,
    courierName: "Delhivery",
    shippingProvider: "delhivery",
    estimatedDelivery: estimatedDelivery || order.estimatedDelivery,
    shippedAt: ["picked_up", "shipped", "out_for_delivery", "delivered"].includes(fulfillmentStatus) ? order.shippedAt || normalizeDate(scanTime) || new Date().toISOString() : order.shippedAt,
  }

  const meaningfulChange =
    order.fulfillmentStatus !== fulfillmentStatus ||
    Boolean(waybill && waybill !== (order.delhiveryWaybill || order.trackingNumber || order.shippingId)) ||
    Boolean(pickupId && pickupId !== order.delhiveryPickupId) ||
    Boolean(delhiveryStatus && delhiveryStatus !== order.delhiveryStatus) ||
    Boolean(estimatedDelivery && estimatedDelivery !== order.estimatedDelivery) ||
    JSON.stringify(delhiveryScans) !== JSON.stringify(order.delhiveryScans || [])

  if (!meaningfulChange) {
    return NextResponse.json({ ok: true, alreadyUpdated: true, orderId: order.id, fulfillmentStatus })
  }

  const updatedOrder = await saveOrderUpdates(order.id, updates)
  const finalOrder = updatedOrder || { ...order, ...updates }
  await sendStatusEmail(finalOrder, fulfillmentStatus === "failed_to_ship")

  return NextResponse.json({ ok: true, orderId: order.id, fulfillmentStatus, emailSent: true })
}

async function findOrder(orderId: string, waybill: string, pickupId: string) {
  if (!isSupabaseAdminConfigured || !supabaseAdmin) return null

  if (orderId) {
    const { data, error } = await supabaseAdmin.from("orders").select("*").eq("id", orderId).maybeSingle()
    if (!error && data) return mapOrderRow(data)
    if (error && !isMissingOrdersTable(error.message)) return null
  }

  const { data, error } = await supabaseAdmin.from("orders").select("*").order("created_at", { ascending: false })
  if (!error && data) {
    return data.map(mapOrderRow).find((order) => matchesOrder(order, orderId, waybill, pickupId)) || null
  }
  if (error && !isMissingOrdersTable(error.message)) return null

  const stored = await readStoredOrders()
  if (stored.error) return null
  return stored.orders.find((order) => matchesOrder(order, orderId, waybill, pickupId)) || null
}

function matchesOrder(order: StoreOrder, orderId: string, waybill: string, pickupId: string) {
  return Boolean(
    (orderId && (order.id === orderId || order.delhiveryOrderId === orderId)) ||
    (pickupId && order.delhiveryPickupId === pickupId) ||
    (waybill && [order.delhiveryWaybill, order.trackingNumber, order.shippingId].includes(waybill)),
  )
}

async function saveOrderUpdates(orderId: string, updates: Partial<StoreOrder>) {
  if (!isSupabaseAdminConfigured || !supabaseAdmin) return null

  const { data: existing, error: readError } = await supabaseAdmin.from("orders").select("address").eq("id", orderId).single()
  if (readError && isMissingOrdersTable(readError.message)) {
    const stored = await updateStoredOrder(orderId, updates)
    return stored.updatedOrder
  }
  if (readError) throw new Error(readError.message)

  const address = { ...(existing?.address || {}) }
  const { error } = await supabaseAdmin.from("orders").update({
    fulfillment_status: updates.fulfillmentStatus,
    shipping_id: updates.trackingNumber || updates.shippingId,
    shipped_at: updates.shippedAt,
    address: {
      ...address,
      __orderMeta: {
        ...(address.__orderMeta || {}),
        delhiveryPickupId: updates.delhiveryPickupId || "",
        delhiveryWaybill: updates.delhiveryWaybill || "",
        delhiveryStatus: updates.delhiveryStatus || "",
        delhiveryScans: updates.delhiveryScans || address.__orderMeta?.delhiveryScans || [],
        delhiveryError: updates.delhiveryError || "",
        trackingNumber: updates.trackingNumber || updates.shippingId || "",
        courierName: updates.courierName || "Delhivery",
        shippingProvider: "delhivery",
        estimatedDelivery: updates.estimatedDelivery || "",
      },
    },
  }).eq("id", orderId)
  if (error) throw new Error(error.message)
  return null
}

async function sendStatusEmail(order: StoreOrder, failed = false) {
  if (!order.address?.email) return
  await sendEmail({
    to: order.address.email,
    subject: failed ? `Delivery failed - confirm your terrace.fc address - ${getOrderDisplayId(order)}` : orderStatusEmailSubject(order),
    html: failed ? failedShipmentEmailHtml(order) : orderStatusEmailHtml(order),
  })
}

function mapDelhiveryWebhookStatus(value: string): StoreOrder["fulfillmentStatus"] | null {
  const raw = value.toLowerCase()
  if (!raw.trim()) return null
  if (raw.includes("delivered")) return "delivered"
  if (raw.includes("out for delivery") || raw.includes("ofd")) return "out_for_delivery"
  if (raw.includes("rto") || raw.includes("return to origin") || raw.includes("undelivered") || raw.includes("delivery failed")) return "failed_to_ship"
  if (raw.includes("pickup completed") || raw.includes("picked up") || raw.includes("shipment picked up") || raw.includes("received at origin")) return "picked_up"
  if (raw.includes("in transit") || raw.includes("in-transit") || raw.includes("dispatched") || raw.includes("connected") || raw.includes("bagged") || raw.includes("shipped")) return "shipped"
  return null
}

function getPayloadText(payload: unknown, keys: string[]) {
  const normalized = new Set(keys.map((key) => key.toLowerCase()))
  const queue = [payload]
  while (queue.length) {
    const value = queue.shift()
    if (!value || typeof value !== "object") continue
    if (Array.isArray(value)) {
      queue.push(...value)
      continue
    }
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (normalized.has(key.toLowerCase()) && child !== null && child !== undefined && typeof child !== "object" && String(child).trim()) {
        return String(child)
      }
      if (child && typeof child === "object") queue.push(child)
    }
  }
  return ""
}

function normalizeDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "" : date.toISOString()
}

function mergeDelhiveryScans(
  existing: Array<{ status: string; location: string; date: string }>,
  next: { status: string; location: string; date: string },
) {
  if (!next.status && !next.location && !next.date) return existing
  const key = (scan: { status: string; location: string; date: string }) => `${scan.date}|${scan.status}|${scan.location}`.toLowerCase()
  const scans = [...existing, next].filter((scan) => scan.status || scan.location || scan.date)
  const seen = new Set<string>()
  return scans.filter((scan) => {
    const scanKey = key(scan)
    if (seen.has(scanKey)) return false
    seen.add(scanKey)
    return true
  }).slice(-30)
}

function isAuthorized(request: Request) {
  const secret = process.env.DELHIVERY_WEBHOOK_SECRET
  if (!secret) return true

  const auth = request.headers.get("authorization") || ""
  const token = request.headers.get("x-delhivery-token") || request.headers.get("x-webhook-token") || ""
  return auth === `Bearer ${secret}` || token === secret
}

function isMissingOrdersTable(message?: string) {
  return String(message || "").toLowerCase().includes("could not find the table")
}

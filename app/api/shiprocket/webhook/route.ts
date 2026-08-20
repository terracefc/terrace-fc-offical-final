import { NextResponse } from "next/server"
import { sendEmail } from "@/lib/email"
import { failedShipmentEmailHtml, orderStatusEmailHtml, orderStatusEmailSubject } from "@/lib/order-status-email"
import { readStoredOrders, updateStoredOrder } from "@/lib/order-storage"
import { getOrderDisplayId, mapOrderRow, type StoreOrder } from "@/lib/orders"
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const secret = process.env.SHIPROCKET_WEBHOOK_SECRET
  if (secret) {
    const token = request.headers.get("x-shiprocket-token") || request.headers.get("x-webhook-token") || ""
    if (token !== secret) return NextResponse.json({ error: "Invalid webhook token." }, { status: 401 })
  }

  const payload = await request.json().catch(() => null)
  const status = getPayloadText(payload, ["current_status", "shipment_status", "status", "status_code"])
  const fulfillmentStatus = mapShiprocketStatus(status, payload)
  if (!fulfillmentStatus) return NextResponse.json({ ok: true, ignored: true, status })

  const orderId = getPayloadText(payload, ["order_id", "channel_order_id", "orderId"])
  const displayOrderId = getPayloadText(payload, ["channel_order_id", "channel_order_number"])
  const shipmentId = getPayloadText(payload, ["shipment_id", "shipmentId"])
  const trackingNumber = getPayloadText(payload, ["awb", "awb_code", "tracking_number", "trackingNumber"])
  const courierName = getPayloadText(payload, ["courier_name", "courier", "courier_company_name"])
  const invoiceNumber = getPayloadText(payload, ["invoice_no", "invoice_number", "invoice_id"])
  const shiprocketOrderDate = getPayloadText(payload, ["order_date", "created_at", "created_on"])

  const order = await findOrder(orderId, shipmentId)
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 })
  if (order.fulfillmentStatus === "cancelled") return NextResponse.json({ ok: true, ignored: true, cancelled: true })

  const updates: Partial<StoreOrder> = {
    fulfillmentStatus,
    trackingNumber: trackingNumber || order.trackingNumber || order.shippingId,
    shippingId: trackingNumber || order.shippingId || order.trackingNumber,
    courierName: courierName || order.courierName || "Shiprocket",
    shiprocketDisplayOrderId: displayOrderId || order.shiprocketDisplayOrderId,
    shiprocketInvoiceNumber: invoiceNumber || order.shiprocketInvoiceNumber,
    shiprocketOrderDate: shiprocketOrderDate || order.shiprocketOrderDate,
    shiprocketStatus: status || "Delivered",
    shippedAt: ["picked_up", "shipped", "out_for_delivery", "delivered"].includes(fulfillmentStatus) ? order.shippedAt || new Date().toISOString() : order.shippedAt,
  }

  const meaningfulChange =
    order.fulfillmentStatus !== fulfillmentStatus ||
    Boolean(trackingNumber && trackingNumber !== (order.trackingNumber || order.shippingId)) ||
    Boolean(courierName && courierName !== order.courierName) ||
    Boolean(status && status !== order.shiprocketStatus)
  if (!meaningfulChange) return NextResponse.json({ ok: true, alreadyUpdated: true, status })

  const updatedOrder = await saveOrderUpdates(order.id, updates)
  const finalOrder = updatedOrder || { ...order, ...updates }
  const shouldEmail =
    order.fulfillmentStatus !== fulfillmentStatus ||
    Boolean(trackingNumber && trackingNumber !== (order.trackingNumber || order.shippingId))
  if (shouldEmail) {
    await sendStatusEmail(finalOrder, fulfillmentStatus === "failed_to_ship" && order.fulfillmentStatus !== "failed_to_ship")
  }

  return NextResponse.json({ ok: true, orderId: order.id, fulfillmentStatus })
}

async function findOrder(orderId: string, shipmentId: string) {
  if (!isSupabaseAdminConfigured || !supabaseAdmin) return null

  const { data, error } = orderId
    ? await supabaseAdmin.from("orders").select("*").eq("id", orderId).maybeSingle()
    : { data: null, error: null }
  if (!error && data) return mapOrderRow(data)
  if (error && !isMissingOrdersTable(error.message)) return null

  const stored = await readStoredOrders()
  if (stored.error) return null
  return stored.orders.find((order) => {
    return (
      (orderId && (order.id === orderId || order.shiprocketOrderId === orderId || orderId.startsWith(`${order.id}-D`))) ||
      (shipmentId && order.shiprocketShipmentId === shipmentId)
    )
  }) || null
}

async function saveOrderUpdates(orderId: string, updates: Partial<StoreOrder>) {
  if (!isSupabaseAdminConfigured || !supabaseAdmin) return null

  const { error: readError } = await supabaseAdmin.from("orders").select("id").eq("id", orderId).single()
  if (readError && isMissingOrdersTable(readError.message)) {
    const stored = await updateStoredOrder(orderId, updates)
    return stored.updatedOrder
  }
  if (readError) throw new Error(readError.message)

  const { data: existing } = await supabaseAdmin.from("orders").select("address").eq("id", orderId).single()
  const address = { ...(existing?.address || {}) }
  const { error } = await supabaseAdmin.from("orders").update({
    fulfillment_status: updates.fulfillmentStatus,
    shipping_id: updates.trackingNumber || updates.shippingId,
    shipped_at: updates.shippedAt,
    address: {
      ...address,
      __orderMeta: {
        ...(address.__orderMeta || {}),
        trackingNumber: updates.trackingNumber || updates.shippingId || "",
        courierName: updates.courierName || "",
        shiprocketDisplayOrderId: updates.shiprocketDisplayOrderId || "",
        shiprocketInvoiceNumber: updates.shiprocketInvoiceNumber || "",
        shiprocketOrderDate: updates.shiprocketOrderDate || "",
        shiprocketStatus: updates.shiprocketStatus || "",
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

function mapShiprocketStatus(status: string, payload: unknown): StoreOrder["fulfillmentStatus"] | null {
  const raw = `${status} ${getPayloadText(payload, ["activity", "event", "description"])}`.toLowerCase()
  if (!raw.trim()) return null
  if (
    raw.includes("undelivered") ||
    raw.includes("delivery failed") ||
    raw.includes("failed delivery") ||
    raw.includes("ndr") ||
    raw.includes("rto") ||
    raw.includes("return to origin") ||
    raw.includes("shipment cancelled") ||
    raw.includes("pickup exception")
  ) return "failed_to_ship"
  if (raw.includes("delivered")) return "delivered"
  if (raw.includes("out for delivery") || raw.includes("ofd")) return "out_for_delivery"
  if (raw.includes("shipped") || raw.includes("in transit") || raw.includes("transit")) return "shipped"
  if (raw.includes("pickup") || raw.includes("picked") || raw.includes("manifested") || raw.includes("awb")) return "picked_up"
  return null
}

function getPayloadText(payload: unknown, keys: string[]) {
  if (!payload || typeof payload !== "object") return ""
  const source = payload as Record<string, unknown>
  for (const key of keys) {
    const value = source[key] ?? (source.data && typeof source.data === "object" ? (source.data as Record<string, unknown>)[key] : undefined)
    if (value !== undefined && value !== null) return String(value)
  }
  return ""
}

function isMissingOrdersTable(message?: string) {
  return String(message || "").toLowerCase().includes("could not find the table")
}

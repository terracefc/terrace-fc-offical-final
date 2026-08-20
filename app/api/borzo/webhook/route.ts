import { NextResponse } from "next/server"
import { sendEmail } from "@/lib/email"
import { orderStatusEmailHtml, orderStatusEmailSubject } from "@/lib/order-status-email"
import { readStoredOrders, updateStoredOrder } from "@/lib/order-storage"
import { mapOrderRow, type StoreOrder } from "@/lib/orders"
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const secret = process.env.BORZO_WEBHOOK_SECRET
  if (secret) {
    const token = request.headers.get("x-borzo-token") || request.headers.get("x-webhook-token") || ""
    if (token !== secret) return NextResponse.json({ error: "Invalid webhook token." }, { status: 401 })
  }

  const payload = await request.json().catch(() => null)
  const orderId = getPayloadText(payload, ["client_order_id", "matter", "order_id", "order_name"])
  const borzoOrderId = getPayloadText(payload, ["order_id", "order_name"])
  const status = getPayloadText(payload, ["status", "order_status", "event"])
  const trackingUrl = getPayloadText(payload, ["tracking_url", "trackingUrl"])
  const fulfillmentStatus = mapBorzoStatus(status)
  if (!fulfillmentStatus) return NextResponse.json({ ok: true, ignored: true, status })

  const order = await findOrder(orderId, borzoOrderId)
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 })
  if (order.fulfillmentStatus === "cancelled") return NextResponse.json({ ok: true, ignored: true, cancelled: true })

  const updates: Partial<StoreOrder> = {
    fulfillmentStatus,
    shippingProvider: "borzo",
    courierName: "Borzo",
    trackingNumber: trackingUrl || borzoOrderId || order.trackingNumber,
    shippingId: borzoOrderId || order.shippingId,
    borzoOrderId: borzoOrderId || order.borzoOrderId,
    borzoTrackingUrl: trackingUrl || order.borzoTrackingUrl,
    borzoStatus: status || "Updated",
    shippedAt: ["picked_up", "shipped", "out_for_delivery", "delivered"].includes(fulfillmentStatus) ? order.shippedAt || new Date().toISOString() : order.shippedAt,
  }

  const updatedOrder = await saveOrderUpdates(order.id, updates)
  await sendStatusEmail(updatedOrder || { ...order, ...updates })

  return NextResponse.json({ ok: true, orderId: order.id, fulfillmentStatus })
}

async function findOrder(orderId: string, borzoOrderId: string) {
  if (isSupabaseAdminConfigured && supabaseAdmin) {
    const { data } = orderId ? await supabaseAdmin.from("orders").select("*").eq("id", orderId).maybeSingle() : { data: null }
    if (data) return mapOrderRow(data)
  }

  const stored = await readStoredOrders()
  if (stored.error) return null
  return stored.orders.find((order) => {
    return (orderId && order.id === orderId) || (borzoOrderId && order.borzoOrderId === borzoOrderId)
  }) || null
}

async function saveOrderUpdates(orderId: string, updates: Partial<StoreOrder>) {
  if (!isSupabaseAdminConfigured || !supabaseAdmin) {
    const stored = await updateStoredOrder(orderId, updates)
    return stored.updatedOrder
  }

  const { data: existing } = await supabaseAdmin.from("orders").select("address").eq("id", orderId).single()
  const address = { ...(existing?.address || {}) }
  const { error } = await supabaseAdmin.from("orders").update({
    fulfillment_status: updates.fulfillmentStatus,
    shipping_id: updates.shippingId || updates.trackingNumber,
    shipped_at: updates.shippedAt,
    address: {
      ...address,
      __orderMeta: {
        ...(address.__orderMeta || {}),
        trackingNumber: updates.trackingNumber || "",
        courierName: updates.courierName || "Borzo",
        shippingProvider: "borzo",
        borzoOrderId: updates.borzoOrderId || "",
        borzoTrackingUrl: updates.borzoTrackingUrl || "",
        borzoStatus: updates.borzoStatus || "",
      },
    },
  }).eq("id", orderId)
  if (error) throw new Error(error.message)
  return null
}

async function sendStatusEmail(order: StoreOrder) {
  if (!order.address?.email) return
  await sendEmail({
    to: order.address.email,
    subject: orderStatusEmailSubject(order),
    html: orderStatusEmailHtml(order),
  })
}

function mapBorzoStatus(status: string): StoreOrder["fulfillmentStatus"] | null {
  const raw = status.toLowerCase()
  if (raw.includes("deliver")) return "delivered"
  if (raw.includes("courier") || raw.includes("perform") || raw.includes("active")) return "shipped"
  if (raw.includes("pickup") || raw.includes("taken")) return "picked_up"
  if (raw.includes("new") || raw.includes("created") || raw.includes("accepted")) return "confirmed"
  return null
}

function getPayloadText(payload: unknown, keys: string[]) {
  if (!payload || typeof payload !== "object") return ""
  const source = payload as Record<string, unknown>
  for (const key of keys) {
    const value = source[key] ?? (source.order && typeof source.order === "object" ? (source.order as Record<string, unknown>)[key] : undefined)
    if (value !== undefined && value !== null) return String(value)
  }
  return ""
}

import { NextResponse } from "next/server"
import { sendEmail } from "@/lib/email"
import { orderStatusEmailHtml, orderStatusEmailSubject } from "@/lib/order-status-email"
import { readStoredOrders } from "@/lib/order-storage"
import { getOrderDisplayId, mapOrderRow, type StoreOrder } from "@/lib/orders"
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin"

export const dynamic = "force-dynamic"

const ADMIN_COOKIE = "terrace_admin"

export async function POST(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "Admin access is required." }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const orderId = String(body?.orderId || "").trim()
  const awb = String(body?.awb || body?.waybill || body?.trackingNumber || "").trim()
  const pickupId = String(body?.pickupId || body?.pickup_id || "").trim()
  const recipientOnly = String(body?.recipientOnly || "").trim()

  if (!orderId && !awb && !pickupId) {
    return NextResponse.json({ error: "Order ID, AWB, or pickup ID is required." }, { status: 400 })
  }

  const order = await findOrder(orderId, awb, pickupId)
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 })
  if (!order.address?.email) return NextResponse.json({ error: "Customer email is missing." }, { status: 400 })

  const recipient = recipientOnly || order.address.email
  const results = [await sendEmail({
    to: recipient,
    subject: orderStatusEmailSubject(order),
    html: orderStatusEmailHtml(order),
  })]

  return NextResponse.json({
    ok: true,
    orderId: order.id,
    orderDisplayId: getOrderDisplayId(order),
    fulfillmentStatus: order.fulfillmentStatus,
    recipients: [recipient],
    emailSent: results.some((result) => result.sent),
  })
}

async function findOrder(orderId: string, awb: string, pickupId: string) {
  if (!isSupabaseAdminConfigured || !supabaseAdmin) return null

  if (orderId) {
    const { data, error } = await supabaseAdmin.from("orders").select("*").eq("id", orderId).maybeSingle()
    if (!error && data) return mapOrderRow(data)
    if (error && !isMissingOrdersTable(error.message)) return null
  }

  const { data, error } = await supabaseAdmin.from("orders").select("*").order("created_at", { ascending: false })
  if (!error && data) {
    const match = data.map(mapOrderRow).find((order) => matchesOrder(order, orderId, awb, pickupId))
    if (match) return match
  }
  if (error && !isMissingOrdersTable(error.message)) return null

  const stored = await readStoredOrders()
  if (stored.error) return null
  return stored.orders.find((order) => matchesOrder(order, orderId, awb, pickupId)) || null
}

function matchesOrder(order: StoreOrder, orderId: string, awb: string, pickupId: string) {
  return Boolean(
    (orderId && order.id === orderId) ||
    (pickupId && order.delhiveryPickupId === pickupId) ||
    (awb && [order.delhiveryWaybill, order.trackingNumber, order.shippingId].includes(awb)),
  )
}

function isAdmin(request: Request) {
  const cookie = request.headers.get("cookie") || ""
  const token = process.env.ADMIN_SESSION_TOKEN || "terrace-admin-session"
  return cookie.split(";").map((part) => part.trim()).some((part) => part === `${ADMIN_COOKIE}=${token}`)
}

function isMissingOrdersTable(message?: string) {
  return String(message || "").toLowerCase().includes("could not find the table")
}

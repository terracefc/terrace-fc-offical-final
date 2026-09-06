import { NextResponse } from "next/server"
import { isAdminRequest } from "@/lib/admin-auth"
import { mapOrderRow, type StoreOrder } from "@/lib/orders"
import { readStoredOrders, updateStoredOrder } from "@/lib/order-storage"
import { getShiprocketOrderIdentity, isShiprocketConfigured } from "@/lib/shiprocket"
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Admin access is required." }, { status: 401 })
  }
  if (!isShiprocketConfigured()) {
    return NextResponse.json({ error: "Shiprocket is not configured in Vercel." }, { status: 500 })
  }

  const body = await request.json().catch(() => null)
  const orderId = String(body?.orderId || "")
  if (!orderId) return NextResponse.json({ error: "Order id is required." }, { status: 400 })

  const order = await findOrder(orderId)
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 })
  if (!order.shiprocketOrderId && !order.shiprocketShipmentId) {
    return NextResponse.json({ error: "This order does not have Shiprocket order/shipment data yet." }, { status: 400 })
  }

  try {
    const identity = await getShiprocketOrderIdentity(order)
    const updates = compactUpdates(identity)
    const updatedOrder = await saveOrderUpdates(order.id, updates)
    return NextResponse.json({ ok: true, order: updatedOrder || { ...order, ...updates } })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Could not sync Shiprocket order id.",
    }, { status: 502 })
  }
}

function compactUpdates(updates: Partial<StoreOrder>) {
  const next: Partial<StoreOrder> = {}
  for (const [key, value] of Object.entries(updates) as [keyof StoreOrder, StoreOrder[keyof StoreOrder]][]) {
    if (value === undefined || value === null || value === "") continue
    next[key] = value as never
  }
  return next
}

async function findOrder(orderId: string) {
  if (isSupabaseAdminConfigured && supabaseAdmin) {
    const { data, error } = await supabaseAdmin.from("orders").select("*").eq("id", orderId).maybeSingle()
    if (!error && data) return mapOrderRow(data)
    if (error && !isMissingOrdersTable(error.message)) return null
  }

  const stored = await readStoredOrders()
  return stored.orders.find((order) => order.id === orderId) || null
}

async function saveOrderUpdates(orderId: string, updates: Partial<StoreOrder>) {
  if (!isSupabaseAdminConfigured || !supabaseAdmin) {
    const stored = await updateStoredOrder(orderId, updates)
    return stored.updatedOrder
  }

  const { data, error: readError } = await supabaseAdmin.from("orders").select("address").eq("id", orderId).single()
  if (readError && isMissingOrdersTable(readError.message)) {
    const stored = await updateStoredOrder(orderId, updates)
    return stored.updatedOrder
  }
  if (readError) throw new Error(readError.message)

  const address = { ...(data?.address || {}) }
  const { error } = await supabaseAdmin.from("orders").update({
    ...(updates.trackingNumber !== undefined ? { shipping_id: updates.trackingNumber } : {}),
    address: {
      ...address,
      __orderMeta: {
        ...(address.__orderMeta || {}),
        ...(updates.shiprocketOrderId !== undefined ? { shiprocketOrderId: updates.shiprocketOrderId } : {}),
        ...(updates.shiprocketDisplayOrderId !== undefined ? { shiprocketDisplayOrderId: updates.shiprocketDisplayOrderId } : {}),
        ...(updates.shiprocketShipmentId !== undefined ? { shiprocketShipmentId: updates.shiprocketShipmentId } : {}),
        ...(updates.trackingNumber !== undefined ? { trackingNumber: updates.trackingNumber } : {}),
        ...(updates.courierName !== undefined ? { courierName: updates.courierName } : {}),
        ...(updates.shiprocketStatus !== undefined ? { shiprocketStatus: updates.shiprocketStatus } : {}),
        ...(updates.shiprocketError !== undefined ? { shiprocketError: updates.shiprocketError } : {}),
      },
    },
  }).eq("id", orderId)
  if (error) throw new Error(error.message)
  return null
}

function isMissingOrdersTable(message?: string) {
  return String(message || "").toLowerCase().includes("could not find the table")
}

import { NextResponse } from "next/server"
import { isAdminRequest } from "@/lib/admin-auth"
import { mapOrderRow, type StoreOrder } from "@/lib/orders"
import { readStoredOrders, updateStoredOrder } from "@/lib/order-storage"
import { getShiprocketLabelDetails, isShiprocketConfigured } from "@/lib/shiprocket"
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
  const forceRefresh = Boolean(body?.forceRefresh)
  const order = orderId ? await findOrder(orderId) : null
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 })
  if (!order.shiprocketOrderId && !order.shiprocketShipmentId) {
    return NextResponse.json({ error: "Create the Shiprocket order first." }, { status: 400 })
  }
  if (!forceRefresh && order.trackingNumber && order.shiprocketDisplayOrderId) {
    return NextResponse.json({ ok: true, order, cached: true })
  }

  try {
    const details = await getShiprocketLabelDetails(order)
    const updates: Partial<StoreOrder> = {
      ...compactShiprocketDetails(details),
      shiprocketError: "",
    }
    const updatedOrder = await saveOrderUpdates(order.id, updates)
    const finalOrder = updatedOrder || { ...order, ...updates }

    if (!finalOrder.trackingNumber) {
      return NextResponse.json({
        error: "Shiprocket has not assigned an AWB yet. Generate the AWB in Shiprocket, then try again.",
      }, { status: 409 })
    }

    return NextResponse.json({ ok: true, order: finalOrder })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Could not fetch Shiprocket label details.",
    }, { status: 502 })
  }
}

function compactShiprocketDetails(details: Partial<StoreOrder>) {
  const updates: Partial<StoreOrder> = {}
  for (const [key, value] of Object.entries(details) as [keyof StoreOrder, StoreOrder[keyof StoreOrder]][]) {
    if (key === "shiprocketOrderId" || key === "shiprocketDisplayOrderId" || key === "shiprocketShipmentId") continue
    if (value === undefined || value === null || value === "") continue
    updates[key] = value as never
  }
  return updates
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
    shipping_id: updates.trackingNumber || updates.shippingId,
    address: {
      ...address,
      __orderMeta: {
        ...(address.__orderMeta || {}),
        trackingNumber: updates.trackingNumber || "",
        courierName: updates.courierName || "",
        shiprocketInvoiceNumber: updates.shiprocketInvoiceNumber || "",
        shiprocketOrderDate: updates.shiprocketOrderDate || "",
        shiprocketStatus: updates.shiprocketStatus || "",
        shiprocketError: "",
      },
    },
  }).eq("id", orderId)
  if (error) throw new Error(error.message)
  return null
}

function isMissingOrdersTable(message?: string) {
  return String(message || "").toLowerCase().includes("could not find the table")
}

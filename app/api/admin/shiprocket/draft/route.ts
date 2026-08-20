import { NextResponse } from "next/server"
import { isAdminRequest } from "@/lib/admin-auth"
import { mapOrderRow, type StoreOrder } from "@/lib/orders"
import { readStoredOrders, updateStoredOrder } from "@/lib/order-storage"
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin"
import { cancelShiprocketOrders, createShiprocketDraftOrder, isShiprocketConfigured } from "@/lib/shiprocket"

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
  const recreate = body?.recreate === true
  if (!orderId) {
    return NextResponse.json({ error: "Order id is required." }, { status: 400 })
  }

  const order = await findOrder(orderId)
  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 })
  }

  try {
    let cancelMessage = ""
    if (recreate) {
      const previousOrderIds = [order.shiprocketOrderId, order.shiprocketDisplayOrderId].filter((value): value is string => Boolean(value))
      if (previousOrderIds.length) {
        const cancelled = await cancelShiprocketOrders(previousOrderIds)
        cancelMessage = cancelled.message
      }
      await saveOrderUpdates(orderId, {
        trackingNumber: "",
        shippingId: "",
        courierName: "Shiprocket",
        estimatedDelivery: "",
        shiprocketOrderId: "",
        shiprocketDisplayOrderId: "",
        shiprocketShipmentId: "",
        shiprocketInvoiceNumber: "",
        shiprocketOrderDate: "",
        shiprocketStatus: cancelMessage || "Old Shiprocket draft cleared.",
        shiprocketError: "",
      })
    }

    const externalOrderId = `${order.id}-D${Date.now().toString().slice(-8)}`
    const draft = await createShiprocketDraftOrder(order, { externalOrderId })
    const updates: Partial<StoreOrder> = {
      ...draft,
      trackingNumber: "",
      shippingId: "",
      courierName: "Shiprocket",
      estimatedDelivery: "",
      shiprocketDisplayOrderId: recreate ? draft.shiprocketOrderId : order.shiprocketDisplayOrderId || order.shiprocketOrderId || draft.shiprocketOrderId,
      shiprocketStatus: draft.shiprocketStatus || "Created",
      shiprocketError: "",
    }
    const updatedOrder = await saveOrderUpdates(orderId, updates)

    return NextResponse.json({ ok: true, recreated: recreate, cancelMessage, order: updatedOrder || { ...order, ...updates } })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Shiprocket order could not be created."
    await saveOrderUpdates(orderId, {
      shiprocketStatus: "failed",
      shiprocketError: message,
    }).catch(() => null)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

async function findOrder(orderId: string) {
  if (!isSupabaseAdminConfigured || !supabaseAdmin) return findStoredOrder(orderId)

  const { data, error } = await supabaseAdmin.from("orders").select("*").eq("id", orderId).single()
  if (!error && data) return mapOrderRow(data)
  if (error && isMissingOrdersTable(error.message)) return findStoredOrder(orderId)

  return null
}

async function findStoredOrder(orderId: string) {
  const stored = await readStoredOrders()
  if (stored.error) return null
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
    address: {
      ...address,
      __orderMeta: {
        ...(address.__orderMeta || {}),
        ...(updates.shiprocketOrderId !== undefined ? { shiprocketOrderId: updates.shiprocketOrderId } : {}),
        ...(updates.shiprocketDisplayOrderId !== undefined ? { shiprocketDisplayOrderId: updates.shiprocketDisplayOrderId } : {}),
        ...(updates.shiprocketShipmentId !== undefined ? { shiprocketShipmentId: updates.shiprocketShipmentId } : {}),
        ...(updates.shiprocketInvoiceNumber !== undefined ? { shiprocketInvoiceNumber: updates.shiprocketInvoiceNumber } : {}),
        ...(updates.shiprocketOrderDate !== undefined ? { shiprocketOrderDate: updates.shiprocketOrderDate } : {}),
        ...(updates.shiprocketStatus !== undefined ? { shiprocketStatus: updates.shiprocketStatus } : {}),
        ...(updates.shiprocketError !== undefined ? { shiprocketError: updates.shiprocketError } : {}),
        ...(updates.trackingNumber !== undefined ? { trackingNumber: updates.trackingNumber } : {}),
        ...(updates.shippingId !== undefined ? { trackingNumber: updates.shippingId } : {}),
        ...(updates.courierName !== undefined ? { courierName: updates.courierName } : {}),
        ...(updates.estimatedDelivery !== undefined ? { estimatedDelivery: updates.estimatedDelivery } : {}),
      },
    },
    ...(updates.trackingNumber !== undefined || updates.shippingId !== undefined ? { shipping_id: updates.trackingNumber ?? updates.shippingId } : {}),
  }).eq("id", orderId)

  if (error) throw new Error(error.message)
  return null
}

function isMissingOrdersTable(message?: string) {
  return String(message || "").toLowerCase().includes("could not find the table")
}

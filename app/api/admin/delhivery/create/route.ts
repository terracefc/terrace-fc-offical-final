import { NextResponse } from "next/server"
import { isAdminRequest } from "@/lib/admin-auth"
import { createDelhiveryOrder, isDelhiveryConfigured } from "@/lib/delhivery"
import { mapOrderRow, type StoreOrder } from "@/lib/orders"
import { readStoredOrders, updateStoredOrder } from "@/lib/order-storage"
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin"
import { sendEmail } from "@/lib/email"
import { orderStatusEmailHtml, orderStatusEmailSubject } from "@/lib/order-status-email"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Admin access is required." }, { status: 401 })
  }
  if (!isDelhiveryConfigured()) {
    return NextResponse.json({ error: "Delhivery token or pickup location is missing." }, { status: 500 })
  }

  const body = await request.json().catch(() => null)
  const orderId = String(body?.orderId || "")
  const recreate = body?.recreate === true
  if (!orderId) return NextResponse.json({ error: "Order id is required." }, { status: 400 })

  const order = await findOrder(orderId)
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 })
  if (order.delhiveryWaybill && !recreate) {
    return NextResponse.json({ ok: true, order, reused: true })
  }

  try {
    const externalOrderId = recreate ? `${order.id}-D${Date.now().toString().slice(-8)}` : order.id
    const delhivery = await createDelhiveryOrder(order, { externalOrderId })
    const updates: Partial<StoreOrder> = {
      ...delhivery,
      delhiveryOrderId: externalOrderId,
      shippingProvider: "delhivery",
      delhiveryError: "",
      shiprocketOrderId: "",
      shiprocketDisplayOrderId: "",
      shiprocketShipmentId: "",
      shiprocketInvoiceNumber: "",
      shiprocketOrderDate: "",
      shiprocketStatus: "",
      shiprocketError: "",
    }
    const updatedOrder = await saveOrderUpdates(order.id, updates)
    const finalOrder = updatedOrder || { ...order, ...updates }
    let emailSent = false
    if (recreate && finalOrder.address?.email) {
      const emailResult = await sendEmail({
        to: finalOrder.address.email,
        subject: order.id === "TFC-482370" ? "AWB number changed - TFC-482370" : orderStatusEmailSubject(finalOrder),
        html: orderStatusEmailHtml(finalOrder, { awbChanged: true }),
      })
      emailSent = emailResult.sent
    }
    return NextResponse.json({ ok: true, recreated: recreate, emailSent, order: finalOrder })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Delhivery order could not be created."
    await saveOrderUpdates(order.id, {
      shippingProvider: "delhivery",
      delhiveryStatus: "failed",
      delhiveryError: message,
    }).catch(() => null)
    return NextResponse.json({ error: message }, { status: 502 })
  }
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
    ...(updates.trackingNumber !== undefined || updates.shippingId !== undefined ? { shipping_id: updates.trackingNumber ?? updates.shippingId } : {}),
    address: {
      ...address,
      __orderMeta: {
        ...(address.__orderMeta || {}),
        ...(updates.delhiveryOrderId !== undefined ? { delhiveryOrderId: updates.delhiveryOrderId } : {}),
        ...(updates.delhiveryPickupId !== undefined ? { delhiveryPickupId: updates.delhiveryPickupId } : {}),
        ...(updates.delhiveryWaybill !== undefined ? { delhiveryWaybill: updates.delhiveryWaybill } : {}),
        ...(updates.delhiveryStatus !== undefined ? { delhiveryStatus: updates.delhiveryStatus } : {}),
        ...(updates.delhiveryError !== undefined ? { delhiveryError: updates.delhiveryError } : {}),
        ...(updates.trackingNumber !== undefined ? { trackingNumber: updates.trackingNumber } : {}),
        ...(updates.shippingId !== undefined ? { trackingNumber: updates.shippingId } : {}),
        ...(updates.courierName !== undefined ? { courierName: updates.courierName } : {}),
        ...(updates.shippingProvider !== undefined ? { shippingProvider: updates.shippingProvider } : {}),
        ...(updates.shiprocketOrderId !== undefined ? { shiprocketOrderId: updates.shiprocketOrderId } : {}),
        ...(updates.shiprocketDisplayOrderId !== undefined ? { shiprocketDisplayOrderId: updates.shiprocketDisplayOrderId } : {}),
        ...(updates.shiprocketShipmentId !== undefined ? { shiprocketShipmentId: updates.shiprocketShipmentId } : {}),
        ...(updates.shiprocketInvoiceNumber !== undefined ? { shiprocketInvoiceNumber: updates.shiprocketInvoiceNumber } : {}),
        ...(updates.shiprocketOrderDate !== undefined ? { shiprocketOrderDate: updates.shiprocketOrderDate } : {}),
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

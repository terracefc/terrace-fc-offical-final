import crypto, { timingSafeEqual } from "crypto"
import { NextResponse } from "next/server"
import { mapOrderRow, type OrderAddress, type StoreOrder } from "@/lib/orders"
import { readStoredOrders, updateStoredOrder } from "@/lib/order-storage"
import { getRazorpayClient, getRazorpayKeySecret } from "@/lib/razorpay"
import { verifyRedeliveryToken } from "@/lib/redelivery"
import { calculateOrderWeightKg, createShiprocketDraftOrder, getShiprocketDeliveryQuote } from "@/lib/shiprocket"
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin"

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const access = verifyRedeliveryToken(String(body?.token || ""))
  if (!access) return NextResponse.json({ error: "This recovery link is invalid or expired." }, { status: 401 })

  const order = await findOrder(access.orderId)
  if (!order || order.address.email.toLowerCase() !== access.email) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 })
  }

  const razorpayOrderId = String(body?.razorpay_order_id || "")
  const razorpayPaymentId = String(body?.razorpay_payment_id || "")
  const razorpaySignature = String(body?.razorpay_signature || "")
  const secret = getRazorpayKeySecret()
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature || !secret) {
    return NextResponse.json({ error: "Payment verification payload is incomplete." }, { status: 400 })
  }

  const expected = crypto.createHmac("sha256", secret).update(`${razorpayOrderId}|${razorpayPaymentId}`).digest("hex")
  if (!safeEqual(expected, razorpaySignature)) {
    return NextResponse.json({ error: "Payment signature mismatch." }, { status: 400 })
  }

  const address = normalizeAddress(body?.address)
  if (!address.name || !address.houseNumber || !address.address || !address.city || !address.state || !/^\d{6}$/.test(address.pincode) || !/^[6-9]\d{9}$/.test(address.phone)) {
    return NextResponse.json({ error: "The delivery address is incomplete." }, { status: 400 })
  }
  const quote = await getShiprocketDeliveryQuote(address.pincode, {
    cod: false,
    weight: calculateOrderWeightKg(order),
  })
  const expectedFee = Math.max(100, Math.ceil(Number(quote.rate || 0)) + Math.ceil(Number(quote.rtoRate || quote.rate || 0)))
  const razorpay = getRazorpayClient()
  const razorpayOrder = razorpay ? await razorpay.orders.fetch(razorpayOrderId) : null
  if (!razorpayOrder || Number(razorpayOrder.amount) !== expectedFee * 100 || razorpayOrder.status !== "paid") {
    return NextResponse.json({ error: "The re-shipping payment could not be confirmed." }, { status: 400 })
  }

  const updatedBase: StoreOrder = {
    ...order,
    address,
    status: "paid",
    fulfillmentStatus: "confirmed",
    trackingNumber: "",
    shippingId: "",
    courierName: "Shiprocket",
    shiprocketOrderId: "",
    shiprocketShipmentId: "",
    shiprocketStatus: "Creating redelivery draft",
    shiprocketError: "",
    redeliveryFee: expectedFee,
    redeliveryPaymentId: razorpayPaymentId,
    redeliveryRazorpayOrderId: razorpayOrderId,
  }
  await saveOrder(order.id, updatedBase)

  try {
    const draft = await createShiprocketDraftOrder(updatedBase, {
      externalOrderId: `${order.id}-RE${Date.now().toString().slice(-8)}`,
    })
    const finalOrder = { ...updatedBase, ...draft }
    await saveOrder(order.id, finalOrder)
    return NextResponse.json({ ok: true, order: finalOrder })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Shiprocket draft could not be created."
    await saveOrder(order.id, {
      ...updatedBase,
      shiprocketStatus: "failed",
      shiprocketError: message,
    })
    return NextResponse.json({ error: `Payment succeeded, but the Shiprocket draft failed: ${message}` }, { status: 502 })
  }
}

async function findOrder(orderId: string): Promise<StoreOrder | null> {
  if (isSupabaseAdminConfigured && supabaseAdmin) {
    const { data, error } = await supabaseAdmin.from("orders").select("*").eq("id", orderId).maybeSingle()
    if (!error && data) return mapOrderRow(data)
  }
  const stored = await readStoredOrders()
  return stored.orders.find((order) => order.id === orderId) || null
}

async function saveOrder(orderId: string, order: StoreOrder) {
  if (isSupabaseAdminConfigured && supabaseAdmin) {
    const { error: readError } = await supabaseAdmin.from("orders").select("id").eq("id", orderId).maybeSingle()
    if (!readError) {
      const { error } = await supabaseAdmin.from("orders").upsert([orderToRow(order)], { onConflict: "id" })
      if (!error) return
    }
  }
  const stored = await updateStoredOrder(orderId, order)
  if (stored.error) throw new Error(stored.error)
}

function orderToRow(order: StoreOrder) {
  return {
    id: order.id,
    customer_id: order.customerId,
    customer_email: order.customerEmail,
    status: order.status,
    fulfillment_status: order.fulfillmentStatus,
    subtotal: order.subtotal,
    delivery_charge: order.deliveryCharge,
    coupon_code: order.couponCode,
    discount: order.discount,
    total: order.total,
    razorpay_order_id: order.razorpayOrderId,
    payment_id: order.paymentId,
    shipping_id: order.shippingId,
    shipped_at: order.shippedAt,
    address: {
      ...order.address,
      __orderMeta: {
        convenienceCharge: order.convenienceCharge || 0,
        trackingNumber: order.trackingNumber || "",
        courierName: order.courierName || "",
        shiprocketOrderId: order.shiprocketOrderId || "",
        shiprocketShipmentId: order.shiprocketShipmentId || "",
        shiprocketStatus: order.shiprocketStatus || "",
        shiprocketError: order.shiprocketError || "",
        redeliveryFee: order.redeliveryFee || 0,
        redeliveryPaymentId: order.redeliveryPaymentId || "",
        redeliveryRazorpayOrderId: order.redeliveryRazorpayOrderId || "",
      },
    },
    items: order.items,
    created_at: order.createdAt,
  }
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function normalizeAddress(value: any): OrderAddress {
  return {
    name: String(value?.name || "").trim(),
    phone: String(value?.phone || "").replace(/\D/g, "").slice(-10),
    email: String(value?.email || "").trim().toLowerCase(),
    houseNumber: String(value?.houseNumber || "").trim(),
    address: String(value?.address || "").trim(),
    deliveryInstructions: String(value?.deliveryInstructions || "").trim(),
    city: String(value?.city || "").trim(),
    state: String(value?.state || "").trim(),
    pincode: String(value?.pincode || "").replace(/\D/g, "").slice(0, 6),
    latitude: Number.isFinite(Number(value?.latitude)) ? Number(value.latitude) : undefined,
    longitude: Number.isFinite(Number(value?.longitude)) ? Number(value.longitude) : undefined,
  }
}

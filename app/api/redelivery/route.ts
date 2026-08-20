import { NextResponse } from "next/server"
import { mapOrderRow, type OrderAddress, type StoreOrder } from "@/lib/orders"
import { readStoredOrders } from "@/lib/order-storage"
import { createRazorpayOrder, getRazorpayKeyId } from "@/lib/razorpay"
import { verifyRedeliveryToken } from "@/lib/redelivery"
import { getShiprocketDeliveryQuote, calculateOrderWeightKg } from "@/lib/shiprocket"
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin"

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") || ""
  const access = verifyRedeliveryToken(token)
  if (!access) return NextResponse.json({ error: "This recovery link is invalid or expired." }, { status: 401 })

  const order = await findOrder(access.orderId)
  if (!order || order.address.email.toLowerCase() !== access.email) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 })
  }

  return NextResponse.json({
    order: {
      id: order.id,
      name: order.address.name,
      phone: order.address.phone,
      email: order.address.email,
      address: order.address,
      items: order.items,
    },
  })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const access = verifyRedeliveryToken(String(body?.token || ""))
  if (!access) return NextResponse.json({ error: "This recovery link is invalid or expired." }, { status: 401 })

  const order = await findOrder(access.orderId)
  if (!order || order.address.email.toLowerCase() !== access.email) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 })
  }

  const address = normalizeAddress(body?.address)
  const addressError = validateAddress(address)
  if (addressError) return NextResponse.json({ error: addressError }, { status: 400 })

  const quote = await getShiprocketDeliveryQuote(address.pincode, {
    cod: false,
    weight: calculateOrderWeightKg(order),
  })
  if (!quote.rate) return NextResponse.json({ error: "Shiprocket did not return a re-shipping price." }, { status: 502 })

  const forwardFee = Math.ceil(quote.rate)
  const rtoFee = Math.ceil(quote.rtoRate || quote.rate)
  const fee = Math.max(100, forwardFee + rtoFee)
  const keyId = getRazorpayKeyId()
  const result = await createRazorpayOrder({
    amountPaise: fee * 100,
    receipt: `redelivery_${order.id}_${Date.now()}`.slice(0, 40),
    notes: {
      type: "redelivery",
      terrace_order_id: order.id,
      customer_email: order.address.email,
      pincode: address.pincode,
    },
  })
  if (!result.order || !keyId) {
    return NextResponse.json({ error: result.error || "Payment could not be created." }, { status: result.status || 500 })
  }

  return NextResponse.json({
    keyId,
    razorpayOrderId: result.order.id,
    amount: result.order.amount,
    currency: result.order.currency,
    fee,
    forwardFee,
    rtoFee,
    estimatedDays: quote.days,
    address,
  })
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

function validateAddress(address: OrderAddress) {
  if (!address.name || !address.houseNumber || !address.address || !address.city || !address.state) return "Complete the delivery address."
  if (!/^[6-9]\d{9}$/.test(address.phone)) return "Enter a valid 10 digit mobile number."
  if (!/^\S+@\S+\.\S+$/.test(address.email)) return "Enter a valid email address."
  if (!/^\d{6}$/.test(address.pincode)) return "Enter a valid 6 digit PIN code."
  return ""
}

async function findOrder(orderId: string): Promise<StoreOrder | null> {
  if (isSupabaseAdminConfigured && supabaseAdmin) {
    const { data, error } = await supabaseAdmin.from("orders").select("*").eq("id", orderId).maybeSingle()
    if (!error && data) return mapOrderRow(data)
  }
  const stored = await readStoredOrders()
  return stored.orders.find((order) => order.id === orderId) || null
}

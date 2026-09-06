import { NextResponse } from "next/server"
import { createBorzoOrder } from "@/lib/borzo"
import { createOrderId, mapOrderRow, type StoreOrder } from "@/lib/orders"
import { readStoredOrders } from "@/lib/order-storage"
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "Admin access is required." }, { status: 401 })
  }

  const missingConfig = getMissingBorzoConfig()
  if (missingConfig) {
    return NextResponse.json({ error: `Borzo is not configured. Missing ${missingConfig}.` }, { status: 500 })
  }

  const body = await request.json().catch(() => null)
  const existingOrder = body?.orderId ? await findOrder(String(body.orderId)) : body?.useLatestOrder ? await findLatestOrder() : null
  const order = existingOrder ? toBorzoTestOrder(existingOrder) : buildBorzoTestOrder(body)

  try {
    const borzo = await createBorzoOrder(order, { test: true })
    return NextResponse.json({ ok: true, order: { ...order, ...borzo } })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Borzo test order failed.",
    }, { status: 502 })
  }
}

async function findOrder(orderId: string) {
  if (isSupabaseAdminConfigured && supabaseAdmin) {
    const { data, error } = await supabaseAdmin.from("orders").select("*").eq("id", orderId).maybeSingle()
    if (!error && data) return mapOrderRow(data)
  }

  const stored = await readStoredOrders()
  if (stored.error) return null
  return stored.orders.find((order) => order.id === orderId) || null
}

async function findLatestOrder() {
  if (isSupabaseAdminConfigured && supabaseAdmin) {
    const { data, error } = await supabaseAdmin.from("orders").select("*").order("created_at", { ascending: false }).limit(1)
    if (!error && data?.[0]) return mapOrderRow(data[0])
  }

  const stored = await readStoredOrders()
  if (stored.error) return null
  return stored.orders[0] || null
}

function toBorzoTestOrder(order: StoreOrder): StoreOrder {
  return {
    ...order,
    id: `${order.id}-BORZO-TEST`,
    status: "test",
    fulfillmentStatus: "confirmed",
    deliveryOption: "expedited",
    shippingProvider: "borzo",
    address: getBorzoTestAddress(order),
    deliveryCharge: 150,
    total: Math.max(0, order.subtotal - (order.discount || 0)) + 150 + (order.convenienceCharge || 0),
  }
}

function buildBorzoTestOrder(body: any): StoreOrder {
  return {
    id: body?.orderId || createOrderId(),
    createdAt: new Date().toISOString(),
    status: "test",
    fulfillmentStatus: "confirmed",
    deliveryOption: "expedited",
    shippingProvider: "borzo",
    address: getBorzoTestAddress(body),
    items: [{
      id: 1,
      name: "Borzo Test Jersey",
      club: "terrace.fc",
      season: "Test",
      size: "M",
      quantity: 1,
      price: 1,
      version: "fan",
    }],
    subtotal: 1,
    deliveryCharge: 150,
    total: 151,
  }
}

function getBorzoTestAddress(source: any): StoreOrder["address"] {
  return {
    name: source?.address?.name || source?.name || "Borzo Test Customer",
    phone: source?.address?.phone || source?.phone || "8147338142",
    email: source?.address?.email || source?.email || process.env.RESEND_TEST_RECIPIENT || "terrace.fc@terracefc.com",
    houseNumber: "villa 51",
    address: "R K Garden, Bluejay Malgudi Villas, Sy.No 85, 1st Cross, opp. to holiday village resort, Anjanapura Village, Uttarahalli Hobli",
    city: "Bengaluru",
    state: "Karnataka",
    pincode: "560109",
  }
}

function isAdmin(request: Request) {
  const cookie = request.headers.get("cookie") || ""
  const token = process.env.ADMIN_SESSION_TOKEN || "terrace-admin-session"
  return cookie.split(";").map((part) => part.trim()).some((part) => part === `terrace_admin=${token}`)
}

function getMissingBorzoConfig() {
  if (!process.env.BORZO_API_TOKEN) return "BORZO_API_TOKEN"
  if (!process.env.BORZO_PICKUP_ADDRESS) return "BORZO_PICKUP_ADDRESS"
  if (!process.env.BORZO_PICKUP_PHONE) return "BORZO_PICKUP_PHONE"
  return ""
}

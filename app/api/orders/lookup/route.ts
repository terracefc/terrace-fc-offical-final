import { NextResponse } from "next/server"
import { mapOrderRow, type StoreOrder } from "@/lib/orders"
import { readStoredOrders } from "@/lib/order-storage"
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const query = String(body?.query || "").trim()

  if (!query) {
    return NextResponse.json({ error: "Enter a phone number or order number." }, { status: 400 })
  }

  const orders = await readLookupOrders()
  const normalizedOrderId = query.toUpperCase().replace(/\s+/g, "")
  const normalizedOrderSuffix = normalizedOrderId.replace(/^TFC-?/, "").replace(/[^A-Z0-9]/g, "")
  const normalizedPhone = query.replace(/\D/g, "")
  const isPhoneLookup = normalizedPhone.length >= 10

  const matches = orders
    .filter((order) => {
      const orderId = order.id.toUpperCase().replace(/\s+/g, "")
      const orderSuffix = orderId.replace(/^TFC-?/, "").replace(/[^A-Z0-9]/g, "")
      if (orderId === normalizedOrderId || orderSuffix === normalizedOrderSuffix) return true
      if (normalizedOrderSuffix.length >= 6 && orderSuffix.endsWith(normalizedOrderSuffix)) return true
      if (!isPhoneLookup) return false
      const orderPhone = String(order.address?.phone || "").replace(/\D/g, "")
      return orderPhone === normalizedPhone || orderPhone.slice(-10) === normalizedPhone.slice(-10)
    })
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())

  if (!matches[0]) {
    return NextResponse.json({ error: "No order was found with those details." }, { status: 404 })
  }

  return NextResponse.json({ orderId: matches[0].id })
}

async function readLookupOrders(): Promise<StoreOrder[]> {
  if (isSupabaseAdminConfigured && supabaseAdmin) {
    const { data, error } = await supabaseAdmin.from("orders").select("*").order("created_at", { ascending: false })
    if (!error) return (data || []).map(mapOrderRow)
  }

  const stored = await readStoredOrders()
  return stored.error ? [] : stored.orders
}

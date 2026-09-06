import { NextResponse } from "next/server"
import { sendOrderConfirmationEmails } from "@/lib/order-confirmation"
import { mapOrderRow, type StoreOrder } from "@/lib/orders"
import { readStoredOrders } from "@/lib/order-storage"
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin"

export async function POST(request: Request) {
  const incomingOrder = await request.json().catch(() => null) as StoreOrder | null

  if (!incomingOrder?.id || !incomingOrder.address?.email) {
    return NextResponse.json({ error: "Valid order is required." }, { status: 400 })
  }

  // Always use the saved order where possible.  The checkout API saves the
  // Delhivery result first, so this ensures the invoice and customer email
  // contain the actual courier and AWB instead of the browser's earlier copy.
  const order = await getLatestOrder(incomingOrder) || incomingOrder
  const { customerResult, adminResult } = await sendOrderConfirmationEmails(order)

  return NextResponse.json({ ok: true, emailSent: customerResult.sent, adminEmailSent: adminResult.sent })
}

async function getLatestOrder(incomingOrder: StoreOrder) {
  if (isSupabaseAdminConfigured && supabaseAdmin) {
    const { data, error } = await supabaseAdmin.from("orders").select("*").eq("id", incomingOrder.id).maybeSingle()
    if (!error && data) return mapOrderRow(data)
  }

  const stored = await readStoredOrders()
  return stored.orders.find((order) => order.id === incomingOrder.id) || null
}

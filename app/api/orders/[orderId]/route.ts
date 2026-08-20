import { NextResponse } from "next/server"
import { mapOrderRow } from "@/lib/orders"
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin"
import { readStoredOrders } from "@/lib/order-storage"

export async function GET(_request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params

  if (!orderId) {
    return NextResponse.json({ error: "Order ID is required." }, { status: 400 })
  }

  if (!isSupabaseAdminConfigured || !supabaseAdmin) {
    return NextResponse.json({ error: "Order storage is not configured." }, { status: 500 })
  }

  const { data, error } = await supabaseAdmin.from("orders").select("*").eq("id", orderId).maybeSingle()

  if (!error && data) {
    return NextResponse.json({ order: mapOrderRow(data) })
  }

  if (error && !isMissingOrdersTable(error.message)) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 })
  }

  const stored = await readStoredOrders()
  const order = stored.orders.find((item) => item.id === orderId)
  if (order) return NextResponse.json({ order })

  return NextResponse.json({ error: "Order not found." }, { status: 404 })
}

function isMissingOrdersTable(message?: string) {
  return String(message || "").toLowerCase().includes("could not find the table")
}

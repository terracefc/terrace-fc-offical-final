import { NextResponse } from "next/server"
import { mapOrderRow } from "@/lib/orders"
import { readStoredOrders } from "@/lib/order-storage"
import { getShiprocketTrackingDetails, isShiprocketConfigured } from "@/lib/shiprocket"
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin"

export const dynamic = "force-dynamic"

export async function GET(_request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params
  const order = await findOrder(decodeURIComponent(orderId))
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 })
  if (order.shippingProvider === "delhivery" || order.delhiveryWaybill || order.courierName?.toLowerCase().includes("delhivery")) {
    const awb = order.delhiveryWaybill || order.trackingNumber || order.shippingId || ""
    return NextResponse.json({
      tracking: {
        awb,
        status: order.delhiveryStatus || order.fulfillmentStatus || "",
        courierName: "Delhivery",
        estimatedDelivery: order.estimatedDelivery || "",
        deliveredAt: order.fulfillmentStatus === "delivered" ? order.shippedAt || "" : "",
        latitude: null,
        longitude: null,
        scans: order.delhiveryScans || [],
      },
    })
  }
  if (!isShiprocketConfigured()) return NextResponse.json({ error: "Tracking is temporarily unavailable." }, { status: 503 })

  const awb = order.trackingNumber || order.shippingId || ""
  if (!awb) return NextResponse.json({ tracking: null })

  try {
    const tracking = await getShiprocketTrackingDetails(awb)
    return NextResponse.json({ tracking })
  } catch {
    return NextResponse.json({ tracking: null })
  }
}

async function findOrder(orderId: string) {
  if (isSupabaseAdminConfigured && supabaseAdmin) {
    const { data, error } = await supabaseAdmin.from("orders").select("*").eq("id", orderId).maybeSingle()
    if (!error && data) return mapOrderRow(data)
    if (error && !String(error.message || "").toLowerCase().includes("could not find the table")) return null
  }

  const stored = await readStoredOrders()
  return stored.orders.find((order) => order.id === orderId) || null
}

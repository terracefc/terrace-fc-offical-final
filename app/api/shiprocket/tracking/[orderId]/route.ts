import { NextResponse } from "next/server"
import { mapOrderRow } from "@/lib/orders"
import { readStoredOrders } from "@/lib/order-storage"
import { getShiprocketTrackingDetails, isShiprocketConfigured } from "@/lib/shiprocket"
import { getDelhiveryTrackingDetails, isDelhiveryConfigured } from "@/lib/delhivery"
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin"

export const dynamic = "force-dynamic"

export async function GET(_request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params
  const order = await findOrder(decodeURIComponent(orderId))
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 })
  if (order.shippingProvider === "delhivery" || order.delhiveryWaybill || order.courierName?.toLowerCase().includes("delhivery")) {
    const awb = order.delhiveryWaybill || order.trackingNumber || order.shippingId || ""
    let live = null
    if (awb && isDelhiveryConfigured()) {
      try { live = await getDelhiveryTrackingDetails(awb) } catch { live = null }
    }
    const scans = live?.scans || order.delhiveryScans || []
    const deliveredScan = [...scans].reverse().find((scan) => /delivered/i.test(scan.status || ""))
    return NextResponse.json({
      tracking: {
        awb: live?.waybill || awb,
        status: live?.status || order.delhiveryStatus || order.fulfillmentStatus || "",
        courierName: "Delhivery",
        estimatedDelivery: live?.estimatedDelivery || order.estimatedDelivery || "",
        // A delivered shipment must use the carrier's delivered scan time,
        // never the original shipped time or its stale ETA.
        deliveredAt: live?.deliveredAt || order.deliveredAt || deliveredScan?.date || "",
        latitude: null,
        longitude: null,
        scans,
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

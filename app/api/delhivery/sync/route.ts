import { NextResponse } from "next/server"
import { sendEmail } from "@/lib/email"
import { getDelhiveryTrackingDetails } from "@/lib/delhivery"
import { failedShipmentEmailHtml, orderStatusEmailHtml, orderStatusEmailSubject } from "@/lib/order-status-email"
import { readStoredOrders, updateStoredOrder } from "@/lib/order-storage"
import { getOrderDisplayId, mapOrderRow, type StoreOrder } from "@/lib/orders"
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin"

export const dynamic = "force-dynamic"

const ACTIVE_DELHIVERY_STATUSES: Array<StoreOrder["fulfillmentStatus"]> = [
  "confirmed",
  "packaged",
  "picked_up",
  "shipped",
  "out_for_delivery",
  "failed_to_ship",
]

export async function GET(request: Request) {
  return syncDelhiveryOrders(request)
}

export async function POST(request: Request) {
  return syncDelhiveryOrders(request)
}

async function syncDelhiveryOrders(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  }

  const orders = await readAllOrders()
  const delhiveryOrders = orders.filter((order) => {
    return Boolean(
      order.fulfillmentStatus !== "cancelled" &&
      ACTIVE_DELHIVERY_STATUSES.includes(order.fulfillmentStatus === "processing" ? "confirmed" : order.fulfillmentStatus || "confirmed") &&
      (order.delhiveryWaybill || order.delhiveryPickupId || (order.shippingProvider === "delhivery" && (order.trackingNumber || order.shippingId))),
    )
  })

  const results = []
  for (const order of delhiveryOrders) {
    const waybill = order.delhiveryWaybill || order.trackingNumber || order.shippingId || ""
    const pickupId = order.delhiveryPickupId || ""
    if (!waybill) {
      results.push({ orderId: order.id, pickupId, changed: false, ignored: true, reason: "Pickup saved; AWB not assigned yet." })
      continue
    }
    try {
      const tracking = await getDelhiveryTrackingDetails(waybill)
      const nextStatus = mapDelhiveryStatus(tracking)
      const delhiveryStatus = formatDelhiveryStatus(tracking)
      if (!nextStatus) {
        if (delhiveryStatus && delhiveryStatus !== order.delhiveryStatus) {
          const updates: Partial<StoreOrder> = {
            delhiveryStatus,
            delhiveryScans: tracking.scans,
            delhiveryError: "",
            delhiveryPickupId: pickupId,
            delhiveryWaybill: waybill,
            trackingNumber: waybill,
            shippingId: waybill,
            courierName: "Delhivery",
            shippingProvider: "delhivery",
            estimatedDelivery: tracking.estimatedDelivery || order.estimatedDelivery,
          }
          await saveOrderUpdates(order.id, updates)
          // A newly-created shipment can return an informational scan before
          // it is actually moving. The invoice confirmation already covers
          // that first update, so do not send a second email here.
          results.push({ orderId: order.id, waybill, pickupId, changed: true, scanOnly: true, delhiveryStatus, emailSent: false })
          continue
        }
        results.push({ orderId: order.id, waybill, pickupId, changed: false, ignored: true, delhiveryStatus: delhiveryStatus || tracking.status || tracking.instructions })
        continue
      }

      const updates: Partial<StoreOrder> = {
        fulfillmentStatus: nextStatus,
        delhiveryStatus: delhiveryStatus || order.delhiveryStatus,
        delhiveryScans: tracking.scans,
        delhiveryError: "",
        delhiveryPickupId: pickupId,
        delhiveryWaybill: waybill,
        trackingNumber: waybill,
        shippingId: waybill,
        courierName: "Delhivery",
        shippingProvider: "delhivery",
        estimatedDelivery: tracking.estimatedDelivery || order.estimatedDelivery,
        shippedAt: ["picked_up", "shipped", "out_for_delivery", "delivered"].includes(nextStatus) ? order.shippedAt || new Date().toISOString() : order.shippedAt,
      }

      const changed =
        order.fulfillmentStatus !== nextStatus ||
        Boolean(updates.delhiveryStatus && updates.delhiveryStatus !== order.delhiveryStatus) ||
        Boolean(updates.estimatedDelivery && updates.estimatedDelivery !== order.estimatedDelivery) ||
        waybill !== (order.delhiveryWaybill || order.trackingNumber || order.shippingId)

      if (!changed) {
        results.push({ orderId: order.id, waybill, pickupId, changed: false, status: nextStatus, delhiveryStatus: updates.delhiveryStatus })
        continue
      }

      const updatedOrder = await saveOrderUpdates(order.id, updates)
      const finalOrder = updatedOrder || { ...order, ...updates }
      await sendStatusEmail(finalOrder, nextStatus === "failed_to_ship")
      results.push({ orderId: order.id, waybill, pickupId, changed: true, status: nextStatus, delhiveryStatus: updates.delhiveryStatus, emailSent: true })
    } catch (error) {
      results.push({ orderId: order.id, waybill, pickupId, changed: false, error: error instanceof Error ? error.message : "Delhivery sync failed." })
    }
  }

  return NextResponse.json({ ok: true, checked: delhiveryOrders.length, results })
}

async function readAllOrders() {
  if (!isSupabaseAdminConfigured || !supabaseAdmin) return [] as StoreOrder[]

  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })

  if (!error && data) return data.map(mapOrderRow)
  if (error && !isMissingOrdersTable(error.message)) return []

  const stored = await readStoredOrders()
  return stored.error ? [] : stored.orders
}

async function saveOrderUpdates(orderId: string, updates: Partial<StoreOrder>) {
  if (!isSupabaseAdminConfigured || !supabaseAdmin) return null

  const { data: existing, error: readError } = await supabaseAdmin.from("orders").select("address").eq("id", orderId).single()
  if (readError && isMissingOrdersTable(readError.message)) {
    const stored = await updateStoredOrder(orderId, updates)
    return stored.updatedOrder
  }
  if (readError) throw new Error(readError.message)

  const address = { ...(existing?.address || {}) }
  const { error } = await supabaseAdmin.from("orders").update({
    fulfillment_status: updates.fulfillmentStatus,
    shipping_id: updates.trackingNumber || updates.shippingId,
    shipped_at: updates.shippedAt,
    address: {
      ...address,
      __orderMeta: {
        ...(address.__orderMeta || {}),
        delhiveryPickupId: updates.delhiveryPickupId || "",
        delhiveryWaybill: updates.delhiveryWaybill || "",
        delhiveryStatus: updates.delhiveryStatus || "",
        delhiveryScans: updates.delhiveryScans || address.__orderMeta?.delhiveryScans || [],
        delhiveryError: updates.delhiveryError || "",
        trackingNumber: updates.trackingNumber || updates.shippingId || "",
        courierName: updates.courierName || "Delhivery",
        shippingProvider: "delhivery",
        estimatedDelivery: updates.estimatedDelivery || "",
      },
    },
  }).eq("id", orderId)
  if (error) throw new Error(error.message)
  return null
}

async function sendStatusEmail(order: StoreOrder, failed = false) {
  if (!order.address?.email) return
  await sendEmail({
    to: order.address.email,
    subject: failed ? `Delivery failed - confirm your terrace.fc address - ${getOrderDisplayId(order)}` : orderStatusEmailSubject(order),
    html: failed ? failedShipmentEmailHtml(order) : orderStatusEmailHtml(order),
  })
}

function formatDelhiveryStatus(tracking: { status: string; statusType: string; instructions: string; location?: string }) {
  return [
    tracking.status || tracking.instructions,
    tracking.statusType,
    tracking.location ? `at ${tracking.location}` : "",
  ].filter(Boolean).join(" ")
}

function mapDelhiveryStatus(tracking: { status: string; statusType: string; instructions: string }): StoreOrder["fulfillmentStatus"] | null {
  const raw = `${tracking.status} ${tracking.statusType} ${tracking.instructions}`.toLowerCase()
  if (!raw.trim()) return null
  if (raw.includes("delivered")) return "delivered"
  if (raw.includes("out for delivery") || raw.includes("ofd")) return "out_for_delivery"
  if (raw.includes("rto") || raw.includes("return to origin") || raw.includes("undelivered") || raw.includes("delivery failed")) return "failed_to_ship"
  if (
    raw.includes("picked") ||
    raw.includes("pickup completed") ||
    raw.includes("received at origin") ||
    raw.includes("origin center")
  ) return "picked_up"
  if (
    raw.includes("in transit") ||
    raw.includes("in-transit") ||
    raw.includes("dispatched") ||
    raw.includes("connected") ||
    raw.includes("bagged") ||
    raw.includes("shipped")
  ) return "shipped"
  return null
}

function isAuthorized(request: Request) {
  const secret = process.env.DELHIVERY_SYNC_SECRET || process.env.CRON_SECRET
  if (!secret) return true

  const auth = request.headers.get("authorization") || ""
  const token = request.headers.get("x-sync-token") || ""
  return auth === `Bearer ${secret}` || token === secret
}

function isMissingOrdersTable(message?: string) {
  return String(message || "").toLowerCase().includes("could not find the table")
}

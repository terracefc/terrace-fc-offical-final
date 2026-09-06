import { readStoredOrders } from "@/lib/order-storage"
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin"

export async function getCouponUsageCounts(codes: string[]) {
  return getCouponUsageSummary(codes).then((summary) => summary.total)
}

export async function getCouponUsageSummary(codes: string[], customerEmail = "") {
  const cleanCodes = [...new Set(codes.map((code) => code.trim().toUpperCase()).filter(Boolean))]
  const total: Record<string, number> = Object.fromEntries(cleanCodes.map((code) => [code, 0]))
  const account: Record<string, number> = Object.fromEntries(cleanCodes.map((code) => [code, 0]))
  const cleanEmail = customerEmail.trim().toLowerCase()

  if (cleanCodes.length === 0 || !isSupabaseAdminConfigured || !supabaseAdmin) return { total, account }

  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("id,coupon_code,fulfillment_status,customer_email,address")
    .in("coupon_code", cleanCodes)

  if (!error) {
    ;(data || []).forEach((row: any) => {
      if (row.fulfillment_status === "cancelled") return
      const code = String(row.coupon_code || "").trim().toUpperCase()
      if (!code) return
      total[code] = (total[code] || 0) + 1
      const rowEmail = String(row.customer_email || row.address?.email || "").trim().toLowerCase()
      if (cleanEmail && rowEmail === cleanEmail) account[code] = (account[code] || 0) + 1
    })
    return { total, account }
  }

  if (!isMissingOrdersTable(error.message)) return { total, account }

  const stored = await readStoredOrders()
  if (stored.error) return { total, account }

  stored.orders.forEach((order) => {
    if (order.fulfillmentStatus === "cancelled") return
    const code = String(order.couponCode || "").trim().toUpperCase()
    if (!code || !cleanCodes.includes(code)) return
    total[code] = (total[code] || 0) + 1
    const orderEmail = String(order.customerEmail || order.address.email || "").trim().toLowerCase()
    if (cleanEmail && orderEmail === cleanEmail) account[code] = (account[code] || 0) + 1
  })

  return { total, account }
}

function isMissingOrdersTable(message?: string) {
  return String(message || "").toLowerCase().includes("could not find the table")
}

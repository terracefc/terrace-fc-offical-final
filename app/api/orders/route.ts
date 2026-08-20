import { NextResponse } from "next/server"
import { getOrderDisplayId, mapOrderRow, type StoreOrder } from "@/lib/orders"
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin"
import { orderStatusEmailHtml, sendEmail } from "@/lib/email"
import { orderStatusEmailSubject } from "@/lib/order-status-email"
import { deleteStoredOrder, readStoredOrders, replaceMongoOrderBackup, updateStoredOrder, upsertStoredOrder } from "@/lib/order-storage"
import { kits as baseKits } from "@/lib/data"
import { getSelectableKitSizes, normalizeSizeStock, type EditableKit } from "@/lib/inventory-client"
import { readStoredInventory, upsertStoredInventoryKit } from "@/lib/inventory-storage"
import { isMongoConfigured } from "@/lib/mongodb"
import { COLAB_CODE, PREPAID_CODE, isComplimentaryCode } from "@/lib/coupons"
import { createDelhiveryOrder, isDelhiveryConfigured } from "@/lib/delhivery"
import { provisionCustomerAfterPayment } from "@/lib/customer-provisioning"

export const runtime = "nodejs"

const ORDER_CACHE_TTL_MS = 15 * 1000
const SUPABASE_RETRY_DELAY_MS = 15 * 60 * 1000
let orderReadCache: { expiresAt: number; orders: StoreOrder[]; storage: string; warning?: string } | null = null
let supabaseRetryAfter = 0

export async function GET() {
  if (orderReadCache && orderReadCache.expiresAt > Date.now()) {
    return NextResponse.json({
      orders: orderReadCache.orders,
      storage: orderReadCache.storage,
      ...(orderReadCache.warning ? { warning: orderReadCache.warning } : {}),
    })
  }

  const stored = await readStoredOrders()

  if (isSupabaseAdminConfigured && supabaseAdmin && Date.now() >= supabaseRetryAfter) {
    const { data, error } = await supabaseAdmin.from("orders").select("*").order("created_at", { ascending: false })
    if (!error) {
      supabaseRetryAfter = 0
      const supabaseOrders = (data || []).map(mapOrderRow)
      const orders = mergeOrders([
        ...supabaseOrders,
        ...(stored.error ? [] : stored.orders),
      ])
      const backup = isMongoConfigured ? await replaceMongoOrderBackup(orders) : null
      const payload = {
        orders,
        storage: backup && !backup.error ? "supabase+mongodb-backup" : "supabase",
        ...(backup?.error ? { warning: `MongoDB backup failed: ${backup.error}` } : {}),
      }
      orderReadCache = { expiresAt: Date.now() + ORDER_CACHE_TTL_MS, ...payload }
      return NextResponse.json(payload)
    }
    supabaseRetryAfter = Date.now() + SUPABASE_RETRY_DELAY_MS
  }

  if (stored.error) return NextResponse.json({ error: stored.error }, { status: 500 })
  const payload = { orders: stored.orders, storage: "mongodb", warning: "Supabase is unavailable; MongoDB backup is active." }
  orderReadCache = { expiresAt: Date.now() + ORDER_CACHE_TTL_MS, ...payload }
  return NextResponse.json(payload)
}

function mergeOrders(orders: StoreOrder[]) {
  const byId = new Map<string, StoreOrder>()
  orders.forEach((order) => {
    const existing = byId.get(order.id)
    if (!existing || new Date(order.createdAt).getTime() >= new Date(existing.createdAt).getTime()) byId.set(order.id, order)
  })
  return Array.from(byId.values()).sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
}

export async function POST(request: Request) {
  orderReadCache = null
  const body = await request.json().catch(() => null)
  const order = body?.order as StoreOrder | undefined

  if (!order?.id || !order.address || !Array.isArray(order.items)) {
    return NextResponse.json({ error: "Order payload is incomplete." }, { status: 400 })
  }

  if (order.total === 0 && !isComplimentaryCode(order.couponCode)) {
    return NextResponse.json({ error: "A valid complimentary coupon is required for a free order." }, { status: 400 })
  }
  if (order.couponCode === PREPAID_CODE && (order.total !== 0 || order.status !== "paid" || order.paymentId !== PREPAID_CODE)) {
    return NextResponse.json({ error: "Complimentary orders must be recorded as fully prepaid." }, { status: 400 })
  }
  if (order.couponCode === COLAB_CODE && (order.total !== 0 || order.status !== "free")) {
    return NextResponse.json({ error: "COLAB orders must be recorded as free orders." }, { status: 400 })
  }

  // Every completed order updates (or creates) the real customer account.
  // This keeps name, email, phone and the complete delivery address available
  // the next time the customer logs in, even on a different device.
  let customerOrder = order
  try {
    const provisioned = await provisionCustomerAfterPayment({
      email: order.address.email,
      name: order.address.name,
      phone: order.address.phone,
      savedAddress: {
        houseNumber: order.address.houseNumber || "",
        address: order.address.address,
        deliveryInstructions: order.address.deliveryInstructions,
        country: order.address.country,
        city: order.address.city,
        state: order.address.state,
        pincode: order.address.pincode,
        latitude: order.address.latitude,
        longitude: order.address.longitude,
      },
    })
    customerOrder = {
      ...order,
      customerId: provisioned.customer.id,
      customerEmail: provisioned.customer.email,
      address: { ...order.address, email: provisioned.customer.email },
    }
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Customer account details could not be saved.",
    }, { status: 500 })
  }

  const orderWithInventory = await applyInventoryDeduction({
    ...customerOrder,
    fulfillmentStatus: "confirmed",
  })
  if (!isSupabaseAdminConfigured || !supabaseAdmin) {
    const stored = await upsertStoredOrder(orderWithInventory)
    if (stored.error) return NextResponse.json({ error: stored.error }, { status: 500 })
    const delivery = await assignAutomaticDelivery(orderWithInventory, "mongodb")
    return NextResponse.json({ ok: true, stored: true, storage: "mongodb", order: delivery.order, ...(delivery.warning ? { warning: delivery.warning } : {}) })
  }

  const { error } = await supabaseAdmin.from("orders").upsert([orderToRow(orderWithInventory)], { onConflict: "id" })

  if (error) {
    const stored = await upsertStoredOrder(orderWithInventory)
    if (stored.error) return NextResponse.json({ error: error.message }, { status: 500 })
    const delivery = await assignAutomaticDelivery(orderWithInventory, "mongodb")
    return NextResponse.json({ ok: true, stored: true, storage: "mongodb", warning: delivery.warning || "Supabase was unavailable.", order: delivery.order })
  }

  if (isMongoConfigured) await upsertStoredOrder(orderWithInventory)
  const delivery = await assignAutomaticDelivery(orderWithInventory, "supabase")
  return NextResponse.json({ ok: true, stored: true, storage: isMongoConfigured ? "supabase+mongodb-backup" : "supabase", order: delivery.order, ...(delivery.warning ? { warning: delivery.warning } : {}) })
}

export async function PATCH(request: Request) {
  orderReadCache = null
  const body = await request.json().catch(() => null)
  const orderId = String(body?.orderId || "")
  const updates = (body?.updates || {}) as Partial<StoreOrder>

  if (!orderId) {
    return NextResponse.json({ error: "Order id is required." }, { status: 400 })
  }

  if (!isSupabaseAdminConfigured || !supabaseAdmin) {
    const current = await readStoredOrders()
    if (current.error) return NextResponse.json({ error: current.error }, { status: 500 })
    const existingOrder = current.orders.find((order) => order.id === orderId)
    if (isCancelledFinal(existingOrder, updates)) {
      return NextResponse.json({ error: "Cancelled orders cannot be reopened or moved to another status." }, { status: 409 })
    }
    if (isLateCustomerCancellation(existingOrder, updates)) {
      return NextResponse.json({ error: "Cancellation requests are only available within 24 hours of placing the order." }, { status: 400 })
    }
    const customerCancellationError = getCustomerCancellationError(existingOrder, updates, body?.customerEmail)
    if (customerCancellationError) return NextResponse.json({ error: customerCancellationError }, { status: 400 })

    const stored = await updateStoredOrder(orderId, updates)
    if (stored.error) return NextResponse.json({ error: stored.error }, { status: stored.error === "Order not found." ? 404 : 500 })
    const updatedOrder = (stored as { updatedOrder?: StoreOrder | null }).updatedOrder
    if (updatedOrder && body?.sendStatusEmail === true && updates.fulfillmentStatus && updates.fulfillmentStatus !== "cancelled") {
      await sendOrderStatusEmail(updatedOrder)
    }
    return NextResponse.json({ ok: true, stored: true, storage: isMongoConfigured ? "mongodb" : "metadata" })
  }

  const { data: existingRow, error: existingError } = await supabaseAdmin.from("orders").select("*").eq("id", orderId).single()
  if (existingError && isMissingOrdersTable(existingError.message)) {
    const current = await readStoredOrders()
    if (current.error) return NextResponse.json({ error: current.error }, { status: 500 })
    const existingOrder = current.orders.find((order) => order.id === orderId)
    if (isCancelledFinal(existingOrder, updates)) {
      return NextResponse.json({ error: "Cancelled orders cannot be reopened or moved to another status." }, { status: 409 })
    }
    if (isLateCustomerCancellation(existingOrder, updates)) {
      return NextResponse.json({ error: "Cancellation requests are only available within 24 hours of placing the order." }, { status: 400 })
    }
    const customerCancellationError = getCustomerCancellationError(existingOrder, updates, body?.customerEmail)
    if (customerCancellationError) return NextResponse.json({ error: customerCancellationError }, { status: 400 })

    const stored = await updateStoredOrder(orderId, updates)
    if (stored.error) return NextResponse.json({ error: stored.error }, { status: stored.error === "Order not found." ? 404 : 500 })
    const updatedOrder = (stored as { updatedOrder?: StoreOrder | null }).updatedOrder
    if (updatedOrder && body?.sendStatusEmail === true && updates.fulfillmentStatus && updates.fulfillmentStatus !== "cancelled") {
      await sendOrderStatusEmail(updatedOrder)
    }
    return NextResponse.json({ ok: true, stored: true, storage: "metadata" })
  }

  const existingOrder = existingRow ? mapOrderRow(existingRow) : null
  if (isCancelledFinal(existingOrder, updates)) {
    return NextResponse.json({ error: "Cancelled orders cannot be reopened or moved to another status." }, { status: 409 })
  }
  if (isLateCustomerCancellation(existingOrder, updates)) {
    return NextResponse.json({ error: "Cancellation requests are only available within 24 hours of placing the order." }, { status: 400 })
  }
  const customerCancellationError = getCustomerCancellationError(existingOrder, updates, body?.customerEmail)
  if (customerCancellationError) return NextResponse.json({ error: customerCancellationError }, { status: 400 })

  const rowUpdates = await orderUpdatesToRow(orderId, updates)
  const { error } = await supabaseAdmin.from("orders").update(rowUpdates).eq("id", orderId)

  if (error) {
    const stored = await updateStoredOrder(orderId, updates)
    if (stored.error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, stored: true, storage: "mongodb", warning: "Supabase was unavailable." })
  }

  if (isMongoConfigured && existingOrder) await upsertStoredOrder({ ...existingOrder, ...updates })

  const nextStatus = updates.fulfillmentStatus
  if (body?.sendStatusEmail === true && existingOrder && nextStatus && nextStatus !== "cancelled") {
    const updatedOrder = { ...existingOrder, ...updates }
    await sendOrderStatusEmail(updatedOrder)
  }

  return NextResponse.json({ ok: true, stored: true })
}

export async function DELETE(request: Request) {
  orderReadCache = null
  const body = await request.json().catch(() => null)
  const orderId = String(body?.orderId || "")

  if (!orderId) {
    return NextResponse.json({ error: "Order id is required." }, { status: 400 })
  }

  if (!isAdmin(request)) {
    return NextResponse.json({ error: "Admin access is required." }, { status: 401 })
  }

  if (!isSupabaseAdminConfigured || !supabaseAdmin) {
    const stored = await readStoredOrders()
    if (stored.error) return NextResponse.json({ error: stored.error }, { status: 500 })
    const order = stored.orders.find((item) => item.id === orderId)
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 })
    if (order.fulfillmentStatus !== "cancelled") {
      return NextResponse.json({ error: "Only cancelled orders can be deleted." }, { status: 400 })
    }
    const deleted = await deleteStoredOrder(orderId)
    if (deleted.error) return NextResponse.json({ error: deleted.error }, { status: deleted.error === "Order not found." ? 404 : 500 })
    return NextResponse.json({ ok: true, deleted: true, storage: isMongoConfigured ? "mongodb" : "metadata" })
  }

  const { data: existingRow, error: existingError } = await supabaseAdmin.from("orders").select("fulfillment_status").eq("id", orderId).single()
  if (existingError && isMissingOrdersTable(existingError.message)) {
    const stored = await readStoredOrders()
    if (stored.error) return NextResponse.json({ error: stored.error }, { status: 500 })
    const order = stored.orders.find((item) => item.id === orderId)
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 })
    if (order.fulfillmentStatus !== "cancelled") {
      return NextResponse.json({ error: "Only cancelled orders can be deleted." }, { status: 400 })
    }
    const deleted = await deleteStoredOrder(orderId)
    if (deleted.error) return NextResponse.json({ error: deleted.error }, { status: deleted.error === "Order not found." ? 404 : 500 })
    return NextResponse.json({ ok: true, deleted: true, storage: "metadata" })
  }

  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })
  if (!existingRow) return NextResponse.json({ error: "Order not found." }, { status: 404 })
  if (existingRow.fulfillment_status !== "cancelled") {
    return NextResponse.json({ error: "Only cancelled orders can be deleted." }, { status: 400 })
  }

  const { error } = await supabaseAdmin.from("orders").delete().eq("id", orderId)
  if (error) {
    const deleted = await deleteStoredOrder(orderId)
    if (deleted.error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, deleted: true, storage: "mongodb", warning: "Supabase was unavailable." })
  }
  if (isMongoConfigured) await deleteStoredOrder(orderId)

  return NextResponse.json({ ok: true, deleted: true })
}

function isMissingOrdersTable(message?: string) {
  return String(message || "").toLowerCase().includes("could not find the table")
}

function isAdmin(request: Request) {
  const cookie = request.headers.get("cookie") || ""
  const token = process.env.ADMIN_SESSION_TOKEN || "terrace-admin-session"
  return cookie.split(";").map((part) => part.trim()).some((part) => part === `terrace_admin=${token}`)
}

function isCancelledFinal(existingOrder: StoreOrder | null | undefined, updates: Partial<StoreOrder>) {
  return Boolean(
    existingOrder?.fulfillmentStatus === "cancelled" &&
    updates.fulfillmentStatus &&
    updates.fulfillmentStatus !== "cancelled",
  )
}

function isLateCustomerCancellation(existingOrder: StoreOrder | null | undefined, updates: Partial<StoreOrder>) {
  if (!isCustomerCancellationRequest(updates)) return false
  const createdAt = new Date(existingOrder?.createdAt || "").getTime()
  if (!Number.isFinite(createdAt)) return true
  return Date.now() - createdAt > 24 * 60 * 60 * 1000
}

async function assignAutomaticDelivery(order: StoreOrder, storage: "supabase" | "mongodb") {
  const country = String(order.address?.country || "India").trim().toLowerCase()
  if (order.status !== "paid" && order.status !== "cod" && order.status !== "free") return { order }
  if (country !== "india" || order.delhiveryWaybill || !isDelhiveryConfigured()) return { order }

  try {
    const deliveryUpdates: Partial<StoreOrder> = {
      ...(await createDelhiveryOrder(order)),
      fulfillmentStatus: "confirmed",
      shippingProvider: "delhivery",
    }
    const updatedOrder = { ...order, ...deliveryUpdates }

    if (storage === "supabase" && isSupabaseAdminConfigured && supabaseAdmin) {
      const rowUpdates = await orderUpdatesToRow(order.id, deliveryUpdates)
      const { error } = await supabaseAdmin.from("orders").update(rowUpdates).eq("id", order.id)
      if (error) throw new Error(error.message)
      if (isMongoConfigured) await upsertStoredOrder(updatedOrder)
    } else {
      const stored = await updateStoredOrder(order.id, deliveryUpdates)
      if (stored.error) throw new Error(stored.error)
    }

    return { order: updatedOrder }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Automatic Delhivery waybill could not be created."
    console.warn(`Automatic Delhivery waybill failed for ${order.id}: ${message}`)
    return { order, warning: `Order confirmed, but the automatic Delhivery waybill could not be created: ${message}` }
  }
}

function isCustomerCancellationRequest(updates: Partial<StoreOrder>) {
  return updates.cancellationBy === "customer" || updates.cancellationRequestedAt !== undefined
}

function getCustomerCancellationError(existingOrder: StoreOrder | null | undefined, updates: Partial<StoreOrder>, customerEmail: unknown) {
  if (!isCustomerCancellationRequest(updates)) return null
  if (!existingOrder) return "Order not found."
  if (updates.fulfillmentStatus === "cancelled") return "Cancellation requests must be reviewed by the store before an order is cancelled."
  if (["picked_up", "shipped", "out_for_delivery", "delivered", "failed_to_ship", "cancelled"].includes(existingOrder.fulfillmentStatus || "pending")) {
    return "This order has already been handed to a courier and cannot be cancelled online."
  }

  const expectedEmail = String(existingOrder.customerEmail || existingOrder.address?.email || "").trim().toLowerCase()
  const suppliedEmail = String(customerEmail || "").trim().toLowerCase()
  if (!expectedEmail || !suppliedEmail || expectedEmail !== suppliedEmail) {
    return "Please sign in with the email address used for this order."
  }
  return null
}

async function findExistingOrder(orderId: string) {
  if (isSupabaseAdminConfigured && supabaseAdmin) {
    const { data, error } = await supabaseAdmin.from("orders").select("*").eq("id", orderId).maybeSingle()
    if (!error && data) return mapOrderRow(data)
    if (error && !isMissingOrdersTable(error.message)) return null
  }

  const stored = await readStoredOrders()
  return stored.orders.find((order) => order.id === orderId) || null
}

async function applyInventoryDeduction(order: StoreOrder) {
  if (order.status !== "paid" && order.status !== "cod" && order.status !== "free") return order

  const existingOrder = await findExistingOrder(order.id)
  if (existingOrder?.inventoryDeducted || order.inventoryDeducted) {
    return {
      ...order,
      inventoryDeducted: true,
      inventoryError: existingOrder?.inventoryError || order.inventoryError || "",
    }
  }

  try {
    await decrementInventory(order.items)
    return {
      ...order,
      inventoryDeducted: true,
      inventoryError: "",
    }
  } catch (error) {
    return {
      ...order,
      inventoryDeducted: false,
      inventoryError: error instanceof Error ? error.message : "Inventory could not be updated.",
    }
  }
}

async function decrementInventory(items: StoreOrder["items"]) {
  const groupedItems = items.reduce((map, item) => {
    const kitId = Number(item.id)
    const quantity = Math.max(0, Math.floor(Number(item.quantity || 0)))
    if (!Number.isFinite(kitId) || kitId <= 0 || quantity <= 0) return map

    const baseKit = baseKits.find((kit) => kit.id === kitId)
    const allowedSizes = getSelectableKitSizes(baseKit || {})
    const size = allowedSizes.includes(item.size) ? item.size : allowedSizes[0] || "M"
    const key = `${kitId}:${size}`
    map.set(key, {
      kitId,
      size,
      quantity: (map.get(key)?.quantity || 0) + quantity,
    })
    return map
  }, new Map<string, { kitId: number; size: string; quantity: number }>())

  const itemGroups = Array.from(groupedItems.values())
  if (!itemGroups.length) return

  const kitIds = Array.from(new Set(itemGroups.map((item) => item.kitId)))
  if (isSupabaseAdminConfigured && supabaseAdmin) {
    const { data, error } = await supabaseAdmin.from("kits").select("*").in("id", kitIds)
    if (error && !isMissingKitsTableError(error)) throw new Error(error.message)
    if (!error) {
      const rowsById = new Map((data || []).map((row: any) => [Number(row.id), rowToEditableKit(row)]))
      const nextKits = kitIds.map((kitId) => {
        const baseKit = baseKits.find((kit) => kit.id === kitId)
        const currentKit = rowsById.get(kitId) || (baseKit ? { ...baseKit } as EditableKit : null)
        if (!currentKit) return null

        const sizeStock = normalizeSizeStock(currentKit)
        itemGroups.filter((item) => item.kitId === kitId).forEach((item) => {
          sizeStock[item.size] = Math.max(0, (sizeStock[item.size] || 0) - item.quantity)
        })

        return {
          ...currentKit,
          sizeStock,
          stock: getSelectableKitSizes(currentKit).reduce((sum, size) => sum + (sizeStock[size] || 0), 0),
        }
      }).filter((kit): kit is EditableKit => Boolean(kit))

      if (nextKits.length) {
        const { error: updateError } = await supabaseAdmin.from("kits").upsert(nextKits.map(editableKitToRow), { onConflict: "id" })
        if (updateError) throw new Error(updateError.message)
      }
      return
    }
  }

  const stored = await readStoredInventory()
  if (stored.error) throw new Error(stored.error)
  const storedById = new Map(stored.kits.map((kit) => [kit.id, kit]))
  for (const kitId of kitIds) {
    const baseKit = baseKits.find((kit) => kit.id === kitId)
    const currentKit = storedById.get(kitId) || (baseKit ? { ...baseKit } as EditableKit : null)
    if (!currentKit) continue

    const sizeStock = normalizeSizeStock(currentKit)
    itemGroups.filter((item) => item.kitId === kitId).forEach((item) => {
      sizeStock[item.size] = Math.max(0, (sizeStock[item.size] || 0) - item.quantity)
    })
    const saved = await upsertStoredInventoryKit({
      ...currentKit,
      sizeStock,
      stock: getSelectableKitSizes(currentKit).reduce((sum, size) => sum + (sizeStock[size] || 0), 0),
    })
    if (saved.error) throw new Error(saved.error)
  }
}

function rowToEditableKit(row: any): EditableKit {
  return {
    id: Number(row.id),
    name: row.name,
    club: row.club,
    season: row.season,
    price: row.price,
    number: row.number,
    league: row.league,
    gradient: row.gradient,
    badge: row.badge,
    image: row.image,
    color: row.color,
    stock: row.stock,
    sizeStock: row.size_stock,
    backImage: row.back_image || row.image,
    description: row.description || "",
    isCustom: row.is_custom,
    isPrivate: row.is_private,
    isDraft: row.is_draft,
    isArchived: row.is_archived,
    isRemoved: row.is_removed,
  }
}

function editableKitToRow(kit: EditableKit) {
  const sizeStock = normalizeSizeStock(kit)
  return {
    id: kit.id,
    name: kit.name,
    club: kit.club,
    season: kit.season,
    price: kit.price,
    number: kit.number,
    league: kit.league,
    gradient: kit.gradient,
    badge: kit.badge,
    image: kit.image,
    color: kit.color,
    stock: getSelectableKitSizes(kit).reduce((sum, size) => sum + (sizeStock[size] || 0), 0),
    size_stock: sizeStock,
    back_image: kit.backImage || kit.image,
    description: kit.description || "",
    is_custom: !!kit.isCustom,
    is_private: !!kit.isPrivate,
    is_draft: !!kit.isDraft,
    is_archived: !!kit.isArchived,
    is_removed: !!kit.isRemoved,
  }
}

function isMissingKitsTableError(error: { message?: string; code?: string }) {
  const message = String(error.message || "").toLowerCase()
  return error.code === "42P01" || message.includes("public.kits") || message.includes("schema cache")
}

function orderToRow(order: StoreOrder) {
  const address = {
    ...order.address,
    __orderMeta: {
      convenienceCharge: order.convenienceCharge || 0,
      trackingNumber: order.trackingNumber || order.shippingId || "",
      courierName: order.courierName || "",
      estimatedDelivery: order.estimatedDelivery || "",
      shiprocketOrderId: order.shiprocketOrderId || "",
      shiprocketDisplayOrderId: order.shiprocketDisplayOrderId || "",
      shiprocketShipmentId: order.shiprocketShipmentId || "",
      shiprocketInvoiceNumber: order.shiprocketInvoiceNumber || "",
      shiprocketOrderDate: order.shiprocketOrderDate || "",
      shiprocketStatus: order.shiprocketStatus || "",
      shiprocketError: order.shiprocketError || "",
      delhiveryOrderId: order.delhiveryOrderId || "",
      delhiveryPickupId: order.delhiveryPickupId || "",
      delhiveryWaybill: order.delhiveryWaybill || "",
      delhiveryStatus: order.delhiveryStatus || "",
      delhiveryScans: Array.isArray(order.delhiveryScans) ? order.delhiveryScans : [],
      delhiveryError: order.delhiveryError || "",
      shippingWeightKg: order.shippingWeightKg || 0,
      inventoryDeducted: !!order.inventoryDeducted,
      inventoryError: order.inventoryError || "",
      deliveryOption: order.deliveryOption || "",
      shippingProvider: order.shippingProvider || "",
      borzoOrderId: order.borzoOrderId || "",
      borzoTrackingUrl: order.borzoTrackingUrl || "",
      borzoStatus: order.borzoStatus || "",
      borzoError: order.borzoError || "",
      redeliveryFee: order.redeliveryFee || 0,
      redeliveryPaymentId: order.redeliveryPaymentId || "",
      redeliveryRazorpayOrderId: order.redeliveryRazorpayOrderId || "",
      cancellationBy: order.cancellationBy || "",
      cancellationNote: order.cancellationNote || "",
      cancellationRequestedAt: order.cancellationRequestedAt || "",
      cancelledAt: order.cancelledAt || "",
      partialCod: !!order.partialCod,
      advancePaid: order.advancePaid || 0,
      codBalance: order.codBalance || 0,
    },
    ...(order.returnStatus && order.returnStatus !== "none" ? {
      __return: {
        status: order.returnStatus,
        reason: order.returnReason,
        note: order.returnNote,
        requestedAt: order.returnRequestedAt,
      },
    } : {}),
  }

  return {
    id: order.id,
    customer_id: order.customerId,
    customer_email: order.customerEmail,
    status: order.status,
    fulfillment_status: order.fulfillmentStatus === "processing" ? "confirmed" : order.fulfillmentStatus || "confirmed",
    subtotal: order.subtotal,
    delivery_charge: order.deliveryCharge,
    coupon_code: order.couponCode,
    discount: order.discount,
    total: order.total,
    razorpay_order_id: order.razorpayOrderId,
    payment_id: order.paymentId,
    shipping_id: order.trackingNumber || order.shippingId,
    shipped_at: order.shippedAt,
    address,
    items: order.items,
    created_at: order.createdAt,
  }
}

async function orderUpdatesToRow(orderId: string, updates: Partial<StoreOrder>) {
  const row: Record<string, unknown> = {}
  if (updates.status !== undefined) row.status = updates.status
  if (updates.fulfillmentStatus !== undefined) row.fulfillment_status = updates.fulfillmentStatus
  if (updates.shippingId !== undefined) row.shipping_id = updates.shippingId
  if (updates.trackingNumber !== undefined) row.shipping_id = updates.trackingNumber
  if (updates.shippedAt !== undefined) row.shipped_at = updates.shippedAt
  if (updates.paymentId !== undefined) row.payment_id = updates.paymentId
  if (updates.razorpayOrderId !== undefined) row.razorpay_order_id = updates.razorpayOrderId
  if (updates.couponCode !== undefined) row.coupon_code = updates.couponCode
  if (updates.subtotal !== undefined) row.subtotal = updates.subtotal
  if (updates.deliveryCharge !== undefined) row.delivery_charge = updates.deliveryCharge
  if (updates.discount !== undefined) row.discount = updates.discount
  if (updates.total !== undefined) row.total = updates.total

  if (
    updates.returnStatus !== undefined ||
    updates.returnReason !== undefined ||
    updates.returnNote !== undefined ||
    updates.returnRequestedAt !== undefined ||
    updates.convenienceCharge !== undefined ||
    updates.trackingNumber !== undefined ||
    updates.shippingId !== undefined ||
    updates.shiprocketOrderId !== undefined ||
    updates.shiprocketDisplayOrderId !== undefined ||
    updates.shiprocketShipmentId !== undefined ||
    updates.shiprocketInvoiceNumber !== undefined ||
    updates.shiprocketOrderDate !== undefined ||
    updates.shiprocketStatus !== undefined ||
    updates.shiprocketError !== undefined ||
    updates.delhiveryOrderId !== undefined ||
    updates.delhiveryPickupId !== undefined ||
    updates.delhiveryWaybill !== undefined ||
    updates.delhiveryStatus !== undefined ||
    updates.delhiveryScans !== undefined ||
    updates.delhiveryError !== undefined ||
    updates.shippingWeightKg !== undefined ||
    updates.inventoryDeducted !== undefined ||
    updates.inventoryError !== undefined ||
    updates.deliveryOption !== undefined ||
    updates.shippingProvider !== undefined ||
    updates.borzoOrderId !== undefined ||
    updates.borzoTrackingUrl !== undefined ||
    updates.borzoStatus !== undefined ||
    updates.borzoError !== undefined ||
    updates.courierName !== undefined ||
    updates.estimatedDelivery !== undefined ||
    updates.cancellationBy !== undefined ||
    updates.cancellationNote !== undefined ||
    updates.cancellationRequestedAt !== undefined ||
    updates.cancelledAt !== undefined
  ) {
    const { data } = await supabaseAdmin!.from("orders").select("address").eq("id", orderId).single()
    const address = { ...(data?.address || {}) }
    row.address = {
      ...address,
      __orderMeta: {
        ...(address.__orderMeta || {}),
        ...(updates.convenienceCharge !== undefined ? { convenienceCharge: updates.convenienceCharge } : {}),
        ...(updates.trackingNumber !== undefined ? { trackingNumber: updates.trackingNumber } : {}),
        ...(updates.shippingId !== undefined ? { trackingNumber: updates.shippingId } : {}),
        ...(updates.shiprocketOrderId !== undefined ? { shiprocketOrderId: updates.shiprocketOrderId } : {}),
        ...(updates.shiprocketDisplayOrderId !== undefined ? { shiprocketDisplayOrderId: updates.shiprocketDisplayOrderId } : {}),
        ...(updates.shiprocketShipmentId !== undefined ? { shiprocketShipmentId: updates.shiprocketShipmentId } : {}),
        ...(updates.shiprocketInvoiceNumber !== undefined ? { shiprocketInvoiceNumber: updates.shiprocketInvoiceNumber } : {}),
        ...(updates.shiprocketOrderDate !== undefined ? { shiprocketOrderDate: updates.shiprocketOrderDate } : {}),
        ...(updates.shiprocketStatus !== undefined ? { shiprocketStatus: updates.shiprocketStatus } : {}),
        ...(updates.shiprocketError !== undefined ? { shiprocketError: updates.shiprocketError } : {}),
        ...(updates.delhiveryOrderId !== undefined ? { delhiveryOrderId: updates.delhiveryOrderId } : {}),
        ...(updates.delhiveryPickupId !== undefined ? { delhiveryPickupId: updates.delhiveryPickupId } : {}),
        ...(updates.delhiveryWaybill !== undefined ? { delhiveryWaybill: updates.delhiveryWaybill } : {}),
        ...(updates.delhiveryStatus !== undefined ? { delhiveryStatus: updates.delhiveryStatus } : {}),
        ...(updates.delhiveryScans !== undefined ? { delhiveryScans: updates.delhiveryScans } : {}),
        ...(updates.delhiveryError !== undefined ? { delhiveryError: updates.delhiveryError } : {}),
        ...(updates.shippingWeightKg !== undefined ? { shippingWeightKg: updates.shippingWeightKg } : {}),
        ...(updates.inventoryDeducted !== undefined ? { inventoryDeducted: updates.inventoryDeducted } : {}),
        ...(updates.inventoryError !== undefined ? { inventoryError: updates.inventoryError } : {}),
        ...(updates.deliveryOption !== undefined ? { deliveryOption: updates.deliveryOption } : {}),
        ...(updates.shippingProvider !== undefined ? { shippingProvider: updates.shippingProvider } : {}),
        ...(updates.borzoOrderId !== undefined ? { borzoOrderId: updates.borzoOrderId } : {}),
        ...(updates.borzoTrackingUrl !== undefined ? { borzoTrackingUrl: updates.borzoTrackingUrl } : {}),
        ...(updates.borzoStatus !== undefined ? { borzoStatus: updates.borzoStatus } : {}),
        ...(updates.borzoError !== undefined ? { borzoError: updates.borzoError } : {}),
        ...(updates.courierName !== undefined ? { courierName: updates.courierName } : {}),
        ...(updates.estimatedDelivery !== undefined ? { estimatedDelivery: updates.estimatedDelivery } : {}),
        ...(updates.cancellationBy !== undefined ? { cancellationBy: updates.cancellationBy } : {}),
        ...(updates.cancellationNote !== undefined ? { cancellationNote: updates.cancellationNote } : {}),
        ...(updates.cancellationRequestedAt !== undefined ? { cancellationRequestedAt: updates.cancellationRequestedAt } : {}),
        ...(updates.cancelledAt !== undefined ? { cancelledAt: updates.cancelledAt } : {}),
      },
      __return: {
        ...(address.__return || {}),
        ...(updates.returnStatus !== undefined ? { status: updates.returnStatus } : {}),
        ...(updates.returnReason !== undefined ? { reason: updates.returnReason } : {}),
        ...(updates.returnNote !== undefined ? { note: updates.returnNote } : {}),
        ...(updates.returnRequestedAt !== undefined ? { requestedAt: updates.returnRequestedAt } : {}),
      },
    }
  }
  return row
}

async function sendOrderStatusEmail(order: StoreOrder) {
  if (!order.address?.email) return

  const result = await sendEmail({
    to: order.address.email,
    subject: orderStatusEmailSubject(order),
    html: orderStatusEmailHtml(order),
  })

  if (!result.sent) {
    console.warn(`Order status email not sent for ${order.id}: ${result.reason || "unknown reason"}`)
  }
}

import { randomUUID } from "crypto"
import type { StoreOrder } from "@/lib/orders"
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin"
import { isMongoConfigured, readMongoSingleton, writeMongoSingleton } from "@/lib/mongodb"

const ORDERS_EMAIL = "site-orders@terracefc.local"
const ORDERS_COLLECTION = "app_storage"
const ORDERS_DOCUMENT = "orders"

export async function readStoredOrders() {
  if (isMongoConfigured) {
    const stored = await readMongoSingleton<StoreOrder[]>(ORDERS_COLLECTION, ORDERS_DOCUMENT, [])
    if (!stored.error) return { orders: normalizeOrders(stored.value), error: null }
  }

  if (!isSupabaseAdminConfigured || !supabaseAdmin) {
    return { orders: [] as StoreOrder[], error: "Order storage is not configured." }
  }

  const user = await findOrdersUser()
  return { orders: normalizeOrders(user?.user_metadata?.orders), error: null }
}

export async function upsertStoredOrder(order: StoreOrder) {
  const current = await readStoredOrders()
  if (current.error) return { error: current.error }

  const orders = [
    order,
    ...current.orders.filter((item) => item.id !== order.id),
  ].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())

  return saveStoredOrders(orders)
}

export async function replaceMongoOrderBackup(orders: StoreOrder[]) {
  if (!isMongoConfigured) return { error: "MongoDB backup is not configured." }
  const saved = await writeMongoSingleton(ORDERS_COLLECTION, ORDERS_DOCUMENT, normalizeOrders(orders))
  return { error: saved.error }
}

export async function updateStoredOrder(orderId: string, updates: Partial<StoreOrder>) {
  const current = await readStoredOrders()
  if (current.error) return { orders: [] as StoreOrder[], updatedOrder: null, error: current.error }

  let updatedOrder: StoreOrder | null = null
  const orders = current.orders.map((order) => {
    if (order.id !== orderId) return order
    if (
      order.fulfillmentStatus === "cancelled" &&
      updates.fulfillmentStatus &&
      updates.fulfillmentStatus !== "cancelled"
    ) {
      updatedOrder = order
      return order
    }
    updatedOrder = { ...order, ...updates }
    return updatedOrder
  })

  if (!updatedOrder) {
    return { orders: current.orders, updatedOrder: null, error: "Order not found." }
  }

  const saved = await saveStoredOrders(orders)
  return { orders, updatedOrder, error: saved.error }
}

export async function deleteStoredOrder(orderId: string) {
  const current = await readStoredOrders()
  if (current.error) return { orders: [] as StoreOrder[], deleted: false, error: current.error }

  const orders = current.orders.filter((order) => order.id !== orderId)
  if (orders.length === current.orders.length) {
    return { orders: current.orders, deleted: false, error: "Order not found." }
  }

  const saved = await saveStoredOrders(orders)
  return { orders, deleted: true, error: saved.error }
}

async function saveStoredOrders(orders: StoreOrder[]) {
  if (isMongoConfigured) {
    const saved = await writeMongoSingleton(ORDERS_COLLECTION, ORDERS_DOCUMENT, orders)
    if (!saved.error) return { error: null }
  }

  if (!isSupabaseAdminConfigured || !supabaseAdmin) {
    return { error: "Order storage is not configured." }
  }

  const existingUser = await findOrdersUser()
  const metadata = { orders }

  if (existingUser) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
      user_metadata: {
        ...existingUser.user_metadata,
        ...metadata,
      },
    })
    return { error: error?.message || null }
  }

  const { error } = await supabaseAdmin.auth.admin.createUser({
    email: ORDERS_EMAIL,
    password: randomUUID(),
    email_confirm: true,
    user_metadata: metadata,
  })

  return { error: error?.message || null }
}

async function findOrdersUser() {
  if (!supabaseAdmin) return null

  const perPage = 1000
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
    if (error) return null

    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === ORDERS_EMAIL)
    if (user) return user
    if ((data.users || []).length < perPage) break
  }

  return null
}

function normalizeOrders(value: unknown) {
  if (!Array.isArray(value)) return [] as StoreOrder[]
  return value.filter((order): order is StoreOrder => {
    return !!order && typeof order === "object" && typeof (order as StoreOrder).id === "string"
  })
}

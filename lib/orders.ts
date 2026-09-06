import type { CartItem } from "@/lib/store-context"
import { getCartItemUnitPrice, type JerseyCustomization, type JerseyVersion } from "@/lib/store-context"

export const ORDERS_KEY = "terrace_orders"
export const CANCELLED_ORDER_HIDE_DELAY_MS = 2 * 60 * 1000
const ORDER_REQUEST_DEDUPE_MS = 5_000
let ordersRequest: Promise<StoreOrder[]> | null = null
let ordersRequestStartedAt = 0

export type OrderAddress = {
  name: string
  lastName?: string
  phone: string
  email: string
  houseNumber?: string
  address: string
  deliveryInstructions?: string
  country?: string
  city: string
  state: string
  pincode: string
  latitude?: number
  longitude?: number
}

export type OrderItem = {
  id: number
  name: string
  image?: string
  description?: string
  club: string
  season: string
  size: string
  quantity: number
  price: number
  version?: JerseyVersion
  customization?: JerseyCustomization
}

export type StoreOrder = {
  id: string
  customerId?: string
  customerEmail?: string
  createdAt: string
  status: "test" | "paid" | "cod" | "free"
  fulfillmentStatus?: "pending" | "processing" | "confirmed" | "packaged" | "picked_up" | "shipped" | "out_for_delivery" | "delivered" | "failed_to_ship" | "cancelled"
  trackingNumber?: string
  courierName?: string
  estimatedDelivery?: string
  returnStatus?: "none" | "requested" | "approved" | "rejected" | "refunded"
  returnReason?: string
  returnNote?: string
  returnRequestedAt?: string
  cancellationBy?: "admin" | "customer"
  cancellationNote?: string
  cancellationRequestedAt?: string
  cancelledAt?: string
  shippingId?: string
  shiprocketOrderId?: string
  shiprocketDisplayOrderId?: string
  shiprocketShipmentId?: string
  shiprocketInvoiceNumber?: string
  shiprocketOrderDate?: string
  shiprocketStatus?: string
  shiprocketError?: string
  deliveryOption?: "normal" | "expedited"
  shippingProvider?: "delhivery" | "shiprocket" | "borzo" | "india_post"
  delhiveryOrderId?: string
  delhiveryPickupId?: string
  delhiveryWaybill?: string
  delhiveryStatus?: string
  delhiveryScans?: Array<{ status: string; location: string; date: string }>
  /** Timestamp reported by the carrier when the shipment was delivered. */
  deliveredAt?: string
  delhiveryError?: string
  shippingWeightKg?: number
  inventoryDeducted?: boolean
  inventoryError?: string
  borzoOrderId?: string
  borzoTrackingUrl?: string
  borzoStatus?: string
  borzoError?: string
  shippedAt?: string
  redeliveryFee?: number
  redeliveryPaymentId?: string
  redeliveryRazorpayOrderId?: string
  paymentId?: string
  razorpayOrderId?: string
  partialCod?: boolean
  advancePaid?: number
  codBalance?: number
  address: OrderAddress
  items: OrderItem[]
  subtotal: number
  deliveryCharge: number
  convenienceCharge?: number
  couponCode?: string
  discount?: number
  total: number
}

export function getOrderDisplayId(order: Pick<StoreOrder, "id">) {
  return order.id
}

export function createOrderId() {
  return `TFC-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${Math.floor(1000 + Math.random() * 9000)}`
}

export function cartToOrderItems(cart: CartItem[]): OrderItem[] {
  return cart.map((item) => ({
    id: item.kit.id,
    name: item.kit.name,
    image: item.kit.image,
    description: item.kit.description,
    club: item.kit.club,
    season: item.kit.season,
    size: item.size,
    quantity: item.quantity,
    price: getCartItemUnitPrice(item),
    version: item.version || "fan",
    customization: item.customization,
  }))
}

export function readOrders() {
  if (typeof window === "undefined") return []

  try {
    const stored = window.localStorage.getItem(ORDERS_KEY)
    const parsed = stored ? JSON.parse(stored) : []
    return Array.isArray(parsed) ? parsed as StoreOrder[] : []
  } catch {
    window.localStorage.removeItem(ORDERS_KEY)
    return []
  }
}

export function isCancelledOrderExpired(order: StoreOrder, now = Date.now()) {
  if (order.fulfillmentStatus !== "cancelled" || !order.cancelledAt) return false

  const cancelledAt = new Date(order.cancelledAt).getTime()
  if (Number.isNaN(cancelledAt)) return false

  return now - cancelledAt >= CANCELLED_ORDER_HIDE_DELAY_MS
}

export async function saveOrder(order: StoreOrder) {
  if (typeof window === "undefined") return { ok: false, error: "Orders can only be saved in the browser." }

  const orders = readOrders()
  window.localStorage.setItem(ORDERS_KEY, JSON.stringify([order, ...orders]))

  const response = await fetch("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order }),
  })

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.error || "Order could not be saved.")
  }

  if (data?.order) {
    const latestOrders = readOrders()
    window.localStorage.setItem(ORDERS_KEY, JSON.stringify(latestOrders.map((item) => item.id === order.id ? data.order : item)))
  }

  return { ok: true, stored: data?.stored === true, order: data?.order as StoreOrder | undefined }
}

export function updateOrder(orderId: string, updates: Partial<StoreOrder>) {
  if (typeof window === "undefined") return []

  const orders = readOrders()
  const currentOrder = orders.find((order) => order.id === orderId)
  if (
    currentOrder?.fulfillmentStatus === "cancelled" &&
    updates.fulfillmentStatus &&
    updates.fulfillmentStatus !== "cancelled"
  ) {
    return orders
  }

  const nextOrders = orders.map((order) => (order.id === orderId ? { ...order, ...updates } : order))
  window.localStorage.setItem(ORDERS_KEY, JSON.stringify(nextOrders))

  fetch("/api/orders", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId, updates }),
  }).catch((error) => console.error("Error updating order:", error))

  return nextOrders
}

export function clearOrders() {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(ORDERS_KEY)
}

export async function fetchOrders(): Promise<StoreOrder[]> {
  if (ordersRequest && Date.now() - ordersRequestStartedAt < ORDER_REQUEST_DEDUPE_MS) return ordersRequest

  ordersRequestStartedAt = Date.now()
  ordersRequest = (async () => {
    const response = await fetch("/api/orders", { cache: "no-store" })
    if (!response.ok) return readOrders()
    const data = await response.json().catch(() => null)
    return Array.isArray(data?.orders) ? data.orders as StoreOrder[] : readOrders()
  })().finally(() => {
    window.setTimeout(() => {
      ordersRequest = null
    }, ORDER_REQUEST_DEDUPE_MS)
  })

  return ordersRequest
}

export function mapOrderRow(row: any): StoreOrder {
  const addressMeta = row.address?.__orderMeta || {}
  const returnMeta = row.address?.__return || {}
  // Rajveer's shipment was recreated in Delhivery; keep the replacement AWB
  // visible everywhere until the carrier metadata is refreshed upstream.
  const delhiveryWaybill = row.id === "TFC-482370" ? "57377610000151" : addressMeta.delhiveryWaybill
  return {
    id: row.id,
    customerId: row.customer_id,
    customerEmail: row.customer_email,
    createdAt: row.created_at,
    status: row.status,
    fulfillmentStatus: row.fulfillment_status,
    returnStatus: row.return_status || returnMeta.status || "none",
    returnReason: row.return_reason || returnMeta.reason,
    returnNote: row.return_note || returnMeta.note,
    returnRequestedAt: row.return_requested_at || returnMeta.requestedAt,
    cancellationBy: addressMeta.cancellationBy,
    cancellationNote: addressMeta.cancellationNote,
    cancellationRequestedAt: addressMeta.cancellationRequestedAt,
    cancelledAt: addressMeta.cancelledAt,
    trackingNumber: delhiveryWaybill || row.tracking_number || addressMeta.trackingNumber || row.shipping_id,
    courierName: delhiveryWaybill || addressMeta.shippingProvider === "delhivery"
      ? "Delhivery"
      : row.courier_name || addressMeta.courierName,
    estimatedDelivery: row.estimated_delivery || addressMeta.estimatedDelivery,
    shippingId: delhiveryWaybill || row.shipping_id || row.tracking_number || addressMeta.trackingNumber,
    shiprocketOrderId: addressMeta.shiprocketOrderId,
    shiprocketDisplayOrderId: addressMeta.shiprocketDisplayOrderId,
    shiprocketShipmentId: addressMeta.shiprocketShipmentId,
    shiprocketInvoiceNumber: addressMeta.shiprocketInvoiceNumber,
    shiprocketOrderDate: addressMeta.shiprocketOrderDate,
    shiprocketStatus: addressMeta.shiprocketStatus,
    shiprocketError: addressMeta.shiprocketError,
    deliveryOption: addressMeta.deliveryOption,
    shippingProvider: addressMeta.shippingProvider,
    delhiveryOrderId: addressMeta.delhiveryOrderId,
    delhiveryPickupId: addressMeta.delhiveryPickupId,
    delhiveryWaybill,
    delhiveryStatus: addressMeta.delhiveryStatus,
    delhiveryScans: Array.isArray(addressMeta.delhiveryScans) ? addressMeta.delhiveryScans : [],
    deliveredAt: row.delivered_at || addressMeta.deliveredAt || "",
    delhiveryError: addressMeta.delhiveryError,
    shippingWeightKg: Number(addressMeta.shippingWeightKg) > 0 ? Number(addressMeta.shippingWeightKg) : undefined,
    inventoryDeducted: Boolean(addressMeta.inventoryDeducted),
    inventoryError: addressMeta.inventoryError,
    borzoOrderId: addressMeta.borzoOrderId,
    borzoTrackingUrl: addressMeta.borzoTrackingUrl,
    borzoStatus: addressMeta.borzoStatus,
    borzoError: addressMeta.borzoError,
    redeliveryFee: addressMeta.redeliveryFee,
    redeliveryPaymentId: addressMeta.redeliveryPaymentId,
    redeliveryRazorpayOrderId: addressMeta.redeliveryRazorpayOrderId,
    shippedAt: row.shipped_at,
    paymentId: row.payment_id,
    razorpayOrderId: row.razorpay_order_id,
    partialCod: Boolean(addressMeta.partialCod),
    advancePaid: Number(addressMeta.advancePaid || 0),
    codBalance: Number(addressMeta.codBalance || 0),
    address: row.address,
    items: row.items,
    subtotal: row.subtotal,
    deliveryCharge: row.delivery_charge,
    convenienceCharge: row.convenience_charge || addressMeta.convenienceCharge || 0,
    couponCode: row.coupon_code,
    discount: row.discount,
    total: row.total,
  }
}

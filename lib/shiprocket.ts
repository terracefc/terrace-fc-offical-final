import type { StoreOrder } from "@/lib/orders"
import { getShippingSku } from "@/lib/shipping-sku"

const SHIPROCKET_API_BASE = "https://apiv2.shiprocket.in/v1/external"

type ShiprocketLoginResponse = {
  token?: string
  message?: string
}

type ShiprocketCreateOrderResponse = {
  order_id?: number
  shipment_id?: number
  status?: string
  status_code?: number
  message?: string
  errors?: unknown
}

type ShiprocketCancelOrderResponse = {
  status?: string
  status_code?: number
  message?: string
  errors?: unknown
}

type ShiprocketServiceabilityResponse = {
  data?: {
    available_courier_companies?: Array<{
      etd?: string
      estimated_delivery_days?: string | number
      rating?: number
      rate?: number
      rto_charges?: number
    }>
  }
  message?: string
}

export function isShiprocketConfigured() {
  return Boolean(process.env.SHIPROCKET_EMAIL && process.env.SHIPROCKET_PASSWORD && process.env.SHIPROCKET_PICKUP_LOCATION)
}

export async function getShiprocketDeliveryDays(destinationPincode: string, options: { cod?: boolean; weight?: number } = {}) {
  const quote = await getShiprocketDeliveryQuote(destinationPincode, options)
  return quote.days
}

export async function getShiprocketDeliveryQuote(destinationPincode: string, options: { cod?: boolean; weight?: number } = {}) {
  const pickupPostcode = process.env.SHIPROCKET_PICKUP_POSTCODE || process.env.SHIPROCKET_PICKUP_PINCODE || "560001"
  const deliveryPostcode = destinationPincode.replace(/\D/g, "").slice(0, 6)
  if (!/^\d{6}$/.test(deliveryPostcode)) {
    throw new Error("A valid delivery PIN code is required.")
  }

  const token = await getShiprocketToken()
  const params = new URLSearchParams({
    pickup_postcode: pickupPostcode,
    delivery_postcode: deliveryPostcode,
    cod: options.cod ? "1" : "0",
    weight: String(options.weight || 0.3),
  })

  const response = await fetch(`${SHIPROCKET_API_BASE}/courier/serviceability/?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await response.json().catch(() => null) as ShiprocketServiceabilityResponse | null
  if (!response.ok) {
    throw new Error(data?.message || "Shiprocket delivery estimate failed.")
  }

  const companies = data?.data?.available_courier_companies || []
  const pricedCompanies = companies
    .map((company) => {
      const rate = Number(company.rate)
      const rtoRate = Number(company.rto_charges)
      if (!Number.isFinite(rate) || rate <= 0) return null
      return {
        rate,
        rtoRate: Number.isFinite(rtoRate) && rtoRate > 0 ? rtoRate : rate,
        days: parseDeliveryDays(company.estimated_delivery_days) || parseEtdDays(company.etd),
      }
    })
    .filter((company): company is { rate: number; rtoRate: number; days: number | null } => Boolean(company))
    .sort((left, right) => (left.rate + left.rtoRate) - (right.rate + right.rtoRate))
  const days = companies
    .map((company) => parseDeliveryDays(company.estimated_delivery_days) || parseEtdDays(company.etd))
    .filter((value): value is number => Number.isFinite(value) && value > 0)

  const best = pricedCompanies[0]
  return {
    rate: best?.rate || null,
    rtoRate: best?.rtoRate || null,
    totalRate: best ? best.rate + best.rtoRate : null,
    days: best?.days || (days.length ? Math.min(...days) : null),
  }
}

export async function createShiprocketDraftOrder(order: StoreOrder, options: { externalOrderId?: string } = {}) {
  const token = await getShiprocketToken()
  const response = await fetch(`${SHIPROCKET_API_BASE}/orders/create/adhoc`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(buildShiprocketOrderPayload(order, options.externalOrderId)),
  })

  const data = await response.json().catch(() => null) as ShiprocketCreateOrderResponse | null
  if (!response.ok || data?.status_code === 0 || data?.errors) {
    throw new Error(formatShiprocketError(data) || "Shiprocket order could not be created.")
  }
  if (!data?.order_id && !data?.shipment_id) {
    throw new Error(formatShiprocketError(data) || "Shiprocket did not return an order or shipment id.")
  }
  if (data?.status && /cancel/i.test(data.status)) {
    throw new Error(`Shiprocket returned cancelled status for this draft: ${data.status}`)
  }

  const shiprocketOrderId = data?.order_id ? String(data.order_id) : ""
  return {
    shiprocketOrderId,
    shiprocketDisplayOrderId: shiprocketOrderId,
    shiprocketShipmentId: data?.shipment_id ? String(data.shipment_id) : "",
    shiprocketStatus: data?.status || data?.message || "Created",
  }
}

export async function cancelShiprocketOrders(orderIds: string[]) {
  const ids = orderIds
    .map((id) => Number(String(id).trim()))
    .filter((id) => Number.isFinite(id) && id > 0)

  if (!ids.length) {
    return { cancelled: false, message: "No Shiprocket order id was available to cancel." }
  }

  const token = await getShiprocketToken()
  const response = await fetch(`${SHIPROCKET_API_BASE}/orders/cancel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ids }),
  })

  const data = await response.json().catch(() => null) as ShiprocketCancelOrderResponse | null
  if (!response.ok || data?.status_code === 0 || data?.errors) {
    throw new Error(formatShiprocketError(data) || "Old Shiprocket order could not be cancelled.")
  }

  return {
    cancelled: true,
    message: data?.message || data?.status || "Old Shiprocket order cancelled.",
  }
}

export async function getShiprocketLabelDetails(order: Pick<StoreOrder, "shiprocketOrderId" | "shiprocketShipmentId">) {
  const token = await getShiprocketToken()
  const responses: unknown[] = []

  if (order.shiprocketShipmentId) {
    responses.push(await fetchShiprocketJson(`/shipments/${encodeURIComponent(order.shiprocketShipmentId)}`, token))
  }
  if (order.shiprocketOrderId) {
    responses.push(await fetchShiprocketJson(`/orders/show/${encodeURIComponent(order.shiprocketOrderId)}`, token))
  }

  const sources = responses.filter(Boolean)
  if (!sources.length) throw new Error("Shiprocket order details could not be found.")

  const awb = findNestedValue(sources, ["awb_code", "awb", "awb_no"])
  const shipmentId =
    findNestedValue(sources, ["shipment_id"]) ||
    order.shiprocketShipmentId ||
    ""
  const invoiceNumber = findNestedValue(sources, ["invoice_no", "invoice_number", "invoice_id"])
  const orderDate = findNestedValue(sources, ["order_date", "created_at", "created_on"])
  const courierName = findNestedValue(sources, ["courier_name", "courier_company_name"])
  const status = findNestedValue(sources, ["status", "status_name", "current_status"])

  return {
    trackingNumber: awb,
    shippingId: awb,
    shiprocketShipmentId: shipmentId,
    shiprocketInvoiceNumber: invoiceNumber,
    shiprocketOrderDate: orderDate,
    courierName,
    shiprocketStatus: status,
  }
}

export async function getShiprocketOrderIdentity(order: Pick<StoreOrder, "id" | "shiprocketOrderId" | "shiprocketShipmentId">) {
  const token = await getShiprocketToken()
  const responses: unknown[] = []

  if (order.shiprocketShipmentId) {
    responses.push(await fetchShiprocketJson(`/shipments/${encodeURIComponent(order.shiprocketShipmentId)}`, token))
  }
  if (order.shiprocketOrderId) {
    responses.push(await fetchShiprocketJson(`/orders/show/${encodeURIComponent(order.shiprocketOrderId)}`, token))
  }

  const sources = responses.filter(Boolean)
  if (!sources.length) throw new Error("Shiprocket order details could not be found.")

  const orderId = findNestedValue(sources, ["order_id"])
  const shipmentId = findNestedValue(sources, ["shipment_id"]) || order.shiprocketShipmentId || ""
  const awb = findNestedValue(sources, ["awb_code", "awb", "awb_no"])
  const courierName = findNestedValue(sources, ["courier_name", "courier_company_name"])
  const status = findNestedValue(sources, ["status", "status_name", "current_status"])

  if (!orderId) throw new Error("Shiprocket did not return an order id for this shipment.")

  return {
    shiprocketOrderId: orderId,
    shiprocketDisplayOrderId: orderId,
    shiprocketShipmentId: shipmentId,
    trackingNumber: awb,
    shippingId: awb,
    courierName,
    shiprocketStatus: status,
    shiprocketError: "",
  } satisfies Partial<StoreOrder>
}

export async function getShiprocketTrackingDetails(awb: string) {
  const cleanAwb = awb.trim()
  if (!cleanAwb) throw new Error("AWB is not available yet.")

  const token = await getShiprocketToken()
  const payload = await fetchShiprocketJson(`/courier/track/awb/${encodeURIComponent(cleanAwb)}`, token)
  if (!payload) throw new Error("Shiprocket tracking is not available yet.")

  const scans = findNestedArrays(payload, ["shipment_track_activities", "scan_data", "scans", "activities"])
    .flatMap((items) => items)
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    .map((item) => ({
      status: firstText(item, ["activity", "status", "status_name", "current_status"]),
      location: firstText(item, ["location", "sr-status-label", "city"]),
      date: firstText(item, ["date", "created_at", "updated_at", "event_time"]),
    }))
    .filter((event) => event.status || event.location || event.date)

  const latitude = Number(findNestedValue([payload], ["latitude", "lat", "current_latitude"]))
  const longitude = Number(findNestedValue([payload], ["longitude", "lng", "lon", "current_longitude"]))

  return {
    awb: cleanAwb,
    status: findNestedValue([payload], ["current_status", "status_name", "status"]),
    courierName: findNestedValue([payload], ["courier_name", "courier_company_name"]),
    estimatedDelivery: findNestedValue([payload], ["edd", "estimated_delivery_date", "etd"]),
    deliveredAt: findNestedValue([payload], ["delivered_date", "delivered_at"]),
    latitude: Number.isFinite(latitude) && latitude !== 0 ? latitude : null,
    longitude: Number.isFinite(longitude) && longitude !== 0 ? longitude : null,
    scans,
  }
}

export function calculateOrderWeightKg(order: Pick<StoreOrder, "items" | "shippingWeightKg">) {
  if (Number(order.shippingWeightKg) > 0) {
    return Number(Number(order.shippingWeightKg).toFixed(2))
  }
  const totalUnits = order.items.reduce((sum, item) => sum + Math.max(0, Number(item.quantity || 0)), 0)
  return Math.max(0.15, Number((totalUnits * 0.15).toFixed(2)))
}

async function getShiprocketToken() {
  const email = process.env.SHIPROCKET_EMAIL
  const password = process.env.SHIPROCKET_PASSWORD
  if (!email || !password) {
    throw new Error("Shiprocket email or password is missing.")
  }

  const response = await fetch(`${SHIPROCKET_API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })

  const data = await response.json().catch(() => null) as ShiprocketLoginResponse | null
  if (!response.ok || !data?.token) {
    throw new Error(data?.message || "Shiprocket login failed.")
  }

  return data.token
}

async function fetchShiprocketJson(path: string, token: string) {
  const response = await fetch(`${SHIPROCKET_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  })
  if (!response.ok) return null
  return response.json().catch(() => null)
}

function findNestedValue(sources: unknown[], keys: string[]) {
  const normalizedKeys = new Set(keys.map((key) => key.toLowerCase()))
  const queue = [...sources]

  while (queue.length) {
    const value = queue.shift()
    if (!value || typeof value !== "object") continue
    if (Array.isArray(value)) {
      queue.push(...value)
      continue
    }

    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (normalizedKeys.has(key.toLowerCase()) && child !== null && child !== undefined && String(child).trim()) {
        return String(child)
      }
      if (child && typeof child === "object") queue.push(child)
    }
  }

  return ""
}

function findNestedArrays(source: unknown, keys: string[]) {
  const normalizedKeys = new Set(keys.map((key) => key.toLowerCase()))
  const queue = [source]
  const matches: unknown[][] = []

  while (queue.length) {
    const value = queue.shift()
    if (!value || typeof value !== "object") continue
    if (Array.isArray(value)) {
      queue.push(...value)
      continue
    }
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (normalizedKeys.has(key.toLowerCase()) && Array.isArray(child)) matches.push(child)
      if (child && typeof child === "object") queue.push(child)
    }
  }
  return matches
}

function firstText(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key]
    if (value !== null && value !== undefined && String(value).trim()) return String(value)
  }
  return ""
}

function buildShiprocketOrderPayload(order: StoreOrder, externalOrderId?: string) {
  const firstItem = order.items[0]
  const orderDate = new Date(order.createdAt)
  const safeDate = Number.isNaN(orderDate.getTime()) ? new Date() : orderDate
  const paymentMethod = order.status === "cod" ? "COD" : "Prepaid"
  const customerName = splitCustomerName(order.address.name)

  return {
    order_id: externalOrderId || order.id,
    order_date: safeDate.toISOString().slice(0, 19).replace("T", " "),
    pickup_location: process.env.SHIPROCKET_PICKUP_LOCATION || "Home",
    channel_id: "",
    comment: "Created from terrace.fc admin as a draft order.",
    billing_customer_name: customerName.firstName,
    billing_last_name: customerName.lastName,
    billing_address: [order.address.houseNumber, order.address.address].filter(Boolean).join(", ").slice(0, 190),
    billing_address_2: (order.address.deliveryInstructions || "").slice(0, 190),
    billing_city: order.address.city,
    billing_pincode: order.address.pincode,
    billing_state: order.address.state,
    billing_country: "India",
    billing_email: order.address.email,
    billing_phone: order.address.phone,
    shipping_is_billing: true,
    order_items: order.items.map((item) => ({
      name: `${item.name} ${item.club} ${item.season}`.slice(0, 190),
      sku: getShippingSku(item),
      units: item.quantity,
      selling_price: item.price,
      discount: "",
      tax: "",
      hsn: "",
    })),
    payment_method: paymentMethod,
    shipping_charges: order.deliveryCharge || 0,
    giftwrap_charges: 0,
    transaction_charges: order.convenienceCharge || 0,
    total_discount: order.discount || 0,
    sub_total: order.subtotal || firstItem?.price || order.total,
    length: Number(process.env.SHIPROCKET_DEFAULT_LENGTH || 30),
    breadth: Number(process.env.SHIPROCKET_DEFAULT_BREADTH || 25),
    height: Number(process.env.SHIPROCKET_DEFAULT_HEIGHT || 4),
    weight: calculateOrderWeightKg(order),
  }
}

function splitCustomerName(name: string) {
  const parts = String(name || "Customer").trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return { firstName: parts[0] || "Customer", lastName: "" }
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") }
}

function formatShiprocketError(data: ShiprocketCreateOrderResponse | ShiprocketCancelOrderResponse | null) {
  if (!data) return ""
  if (typeof data.message === "string") return data.message
  if (data.errors) return JSON.stringify(data.errors)
  return ""
}

function parseDeliveryDays(value: string | number | undefined) {
  if (typeof value === "number") return Math.max(1, Math.ceil(value))
  const match = String(value || "").match(/\d+/)
  return match ? Math.max(1, Number(match[0])) : null
}

function parseEtdDays(value: string | undefined) {
  if (!value) return null
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return parseDeliveryDays(value)
  const diffDays = Math.ceil((timestamp - Date.now()) / (24 * 60 * 60 * 1000))
  return Math.max(1, diffDays)
}

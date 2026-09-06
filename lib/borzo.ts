import type { StoreOrder } from "@/lib/orders"
import { calculateOrderWeightKg } from "@/lib/shiprocket"

const BORZO_PRODUCTION_API_BASE = "https://robot-in.borzodelivery.com/api/business/1.8"
const BORZO_TEST_API_BASE = "https://robotapitest-in.borzodelivery.com/api/business/1.8"

type BorzoOrderResponse = {
  order?: {
    order_id?: number | string
    order_name?: string
    payment_amount?: number
    status?: string
    tracking_url?: string
    points?: BorzoPointResponse[]
  }
  order_id?: number | string
  order_name?: string
  status?: string
  tracking_url?: string
  errors?: unknown
  message?: string
}

type BorzoCalculateResponse = BorzoOrderResponse & {
  payment_amount?: number
  price?: number
  delivery_fee_amount?: number
}

type BorzoPointResponse = {
  required_finish_datetime?: string
  estimated_arrival_datetime?: string
  arrival_finish_datetime?: string
}

export function isBorzoConfigured() {
  return Boolean(process.env.BORZO_API_TOKEN && process.env.BORZO_PICKUP_ADDRESS && process.env.BORZO_PICKUP_PHONE)
}

export async function createBorzoOrder(order: StoreOrder, options: { test?: boolean } = {}) {
  const token = process.env.BORZO_API_TOKEN
  if (!token) throw new Error("Borzo API token is missing.")

  const response = await fetch(`${getBorzoApiBase(options.test)}/create-order`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-DV-Auth-Token": token,
    },
    body: JSON.stringify(buildBorzoPayload(order, options.test)),
  })

  const data = await response.json().catch(() => null) as BorzoOrderResponse | null
  if (!response.ok || data?.errors) {
    throw new Error(formatBorzoError(data) || "Borzo order could not be created.")
  }

  const source = data?.order || data || {}
  const orderId = source.order_id || source.order_name || data?.order_id || data?.order_name
  if (!orderId) throw new Error(formatBorzoError(data) || "Borzo did not return an order id.")

  return {
    borzoOrderId: String(orderId),
    borzoTrackingUrl: source.tracking_url || data?.tracking_url || "",
    borzoStatus: source.status || data?.status || "Created",
  }
}

export async function calculateBorzoDeliveryPrice(order: StoreOrder, options: { test?: boolean } = {}) {
  const estimate = await calculateBorzoDeliveryEstimate(order, options)
  return estimate.price
}

export async function calculateBorzoDeliveryEstimate(order: StoreOrder, options: { test?: boolean } = {}) {
  const token = process.env.BORZO_API_TOKEN
  if (!token) throw new Error("Borzo API token is missing.")

  const response = await fetch(`${getBorzoApiBase(options.test)}/calculate-order`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-DV-Auth-Token": token,
    },
    body: JSON.stringify(buildBorzoPayload(order, options.test)),
  })

  const data = await response.json().catch(() => null) as BorzoCalculateResponse | null
  if (!response.ok || data?.errors) {
    throw new Error(formatBorzoError(data) || "Borzo delivery price could not be checked.")
  }

  const source = data?.order || data || {}
  const amount = Number(source.payment_amount ?? data?.payment_amount ?? data?.price ?? data?.delivery_fee_amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Borzo did not return a delivery price.")
  }

  const dropoffPoint = source.points?.[source.points.length - 1]

  return {
    price: amount,
    estimatedDate: dropoffPoint?.estimated_arrival_datetime || dropoffPoint?.arrival_finish_datetime || dropoffPoint?.required_finish_datetime || "",
  }
}

function buildBorzoPayload(order: StoreOrder, test = false) {
  const houseNumber = order.address.houseNumber?.trim() || ""
  const dropoffAddress = [
    houseNumber,
    order.address.address,
    order.address.city,
    order.address.state,
    order.address.pincode,
  ].filter(Boolean).join(", ")
  const dropoffNote = [
    houseNumber ? `House/flat: ${houseNumber}` : "",
    `Full address: ${dropoffAddress}`,
    order.address.deliveryInstructions ? `Delivery instructions: ${order.address.deliveryInstructions}` : "",
    `Order: ${order.id}`,
  ].filter(Boolean).join("\n")

  return {
    matter: `terrace.fc ${order.id}${test ? " test" : ""}`,
    total_weight_kg: calculateOrderWeightKg(order),
    is_client_notification_enabled: true,
    is_contact_person_notification_enabled: true,
    points: [
      {
        address: process.env.BORZO_PICKUP_ADDRESS,
        contact_person: {
          phone: process.env.BORZO_PICKUP_PHONE,
          name: process.env.BORZO_PICKUP_NAME || "terrace.fc",
        },
      },
      {
        address: dropoffAddress,
        building_number: houseNumber || undefined,
        apartment_number: houseNumber || undefined,
        ...(houseNumber ? {} : {
          latitude: order.address.latitude,
          longitude: order.address.longitude,
        }),
        note: dropoffNote,
        contact_person: {
          phone: order.address.phone,
          name: order.address.name,
        },
      },
    ],
  }
}

function getBorzoApiBase(test = false) {
  if (test) return BORZO_TEST_API_BASE
  return (process.env.BORZO_API_BASE || BORZO_PRODUCTION_API_BASE).replace(/\/$/, "")
}

function formatBorzoError(data: BorzoOrderResponse | null) {
  if (!data) return ""
  if (typeof data.message === "string") return data.message
  if (data.errors) return JSON.stringify(data.errors)
  return ""
}

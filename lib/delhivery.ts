import type { StoreOrder } from "@/lib/orders"
import { calculateOrderWeightKg } from "@/lib/shiprocket"
import { getShippingSku } from "@/lib/shipping-sku"

const DELHIVERY_PRODUCTION_API_BASE = "https://track.delhivery.com"
const DELHIVERY_STAGING_API_BASE = "https://staging-express.delhivery.com"

type DelhiveryCreateResponse = {
  packages?: Array<{
    waybill?: string
    status?: string
    remarks?: string[]
    pickup_id?: string | number
    pickupId?: string | number
    pickup_request_id?: string | number
    pickupRequestId?: string | number
    manifest_id?: string | number
    manifestId?: string | number
  }>
  upload_wbn?: string
  waybill?: string
  status?: string
  remarks?: string[]
  error?: string
  pickup_id?: string | number
  pickupId?: string | number
  pickup_request_id?: string | number
  pickupRequestId?: string | number
  manifest_id?: string | number
  manifestId?: string | number
}

export type DelhiveryTrackingDetails = {
  waybill: string
  status: string
  statusType: string
  instructions: string
  location: string
  estimatedDelivery: string
  scans: Array<{ status: string; location: string; date: string }>
}

export function isDelhiveryConfigured() {
  return Boolean(process.env.DELHIVERY_API_TOKEN && process.env.DELHIVERY_PICKUP_LOCATION)
}

export async function createDelhiveryOrder(order: StoreOrder, options: { externalOrderId?: string } = {}) {
  const token = process.env.DELHIVERY_API_TOKEN
  const pickupLocation = process.env.DELHIVERY_PICKUP_LOCATION
  if (!token || !pickupLocation) {
    throw new Error("Delhivery token or pickup location is missing.")
  }

  const response = await fetch(`${getDelhiveryBaseUrl()}/api/cmu/create.json`, {
    method: "POST",
    headers: {
      Authorization: `Token ${token}`,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      format: "json",
      data: JSON.stringify(buildDelhiveryPayload(order, pickupLocation, options.externalOrderId)),
    }).toString(),
  })

  const data = await response.json().catch(() => null) as DelhiveryCreateResponse | null
  if (!response.ok) {
    throw new Error(getDelhiveryError(data) || "Delhivery order could not be created.")
  }

  const firstPackage = data?.packages?.[0]
  if (String(firstPackage?.status || data?.status || "").toLowerCase() === "fail") {
    throw new Error(getDelhiveryError(data) || "Delhivery order could not be created.")
  }

  const waybill = firstPackage?.waybill || data?.waybill || ""
  const pickupId = firstNonEmpty([
    firstPackage?.pickup_id,
    firstPackage?.pickupId,
    firstPackage?.pickup_request_id,
    firstPackage?.pickupRequestId,
    firstPackage?.manifest_id,
    firstPackage?.manifestId,
    data?.pickup_id,
    data?.pickupId,
    data?.pickup_request_id,
    data?.pickupRequestId,
    data?.manifest_id,
    data?.manifestId,
    findNestedText(data, ["pickup_id", "pickupId", "pickup_request_id", "pickupRequestId", "manifest_id", "manifestId"]),
  ])
  if (!waybill) {
    throw new Error(getDelhiveryError(data) || "Delhivery did not return a waybill.")
  }

  return {
    delhiveryOrderId: order.id,
    delhiveryPickupId: pickupId,
    delhiveryWaybill: waybill,
    delhiveryStatus: firstPackage?.status || data?.status || "Created",
    delhiveryError: "",
    trackingNumber: waybill,
    shippingId: waybill,
    courierName: "Delhivery",
  } satisfies Partial<StoreOrder>
}

export async function getDelhiveryTrackingDetails(waybill: string): Promise<DelhiveryTrackingDetails> {
  const token = process.env.DELHIVERY_API_TOKEN
  const cleanWaybill = waybill.trim()
  if (!token) throw new Error("Delhivery token is missing.")
  if (!cleanWaybill) throw new Error("Delhivery waybill is missing.")

  const params = new URLSearchParams({ token, waybill: cleanWaybill })
  const response = await fetch(`${getDelhiveryBaseUrl()}/api/v1/packages/json/?${params.toString()}`, {
    headers: {
      Authorization: `Token ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  })

  const data = await response.json().catch(() => null)
  if (!response.ok || !data) {
    throw new Error(getDelhiveryError(data) || "Delhivery tracking lookup failed.")
  }
  const shipment = Array.isArray(data?.ShipmentData) ? data.ShipmentData[0]?.Shipment : data?.Shipment
  const currentStatus = shipment?.Status && typeof shipment.Status === "object" ? shipment.Status : null
  const latestScan = Array.isArray(shipment?.Scans) ? shipment.Scans[shipment.Scans.length - 1]?.ScanDetail : null
  const scans = Array.isArray(shipment?.Scans)
    ? shipment.Scans
        .map((item: any) => item?.ScanDetail || item?.Scan || item)
        .map((scan: any) => ({
          status: firstNonEmpty([scan?.Instructions, scan?.Scan, scan?.Status, scan?.ScanType]),
          location: firstNonEmpty([scan?.ScannedLocation, scan?.StatusLocation, scan?.Location, scan?.city]),
          date: firstNonEmpty([scan?.ScanDateTime, scan?.StatusDateTime, scan?.DateTime, scan?.timestamp]),
        }))
        .filter((scan) => scan.status || scan.location || scan.date)
    : []

  return {
    waybill: cleanWaybill,
    status: textFrom(currentStatus?.Status) || textFrom(latestScan?.Scan) || findNestedText(data, ["Status"]) || findNestedText(data, ["status"]),
    statusType: textFrom(currentStatus?.StatusType) || textFrom(latestScan?.ScanType) || findNestedText(data, ["StatusType", "status_type"]),
    instructions: textFrom(currentStatus?.Instructions) || textFrom(latestScan?.Instructions) || findNestedText(data, ["Instructions", "instructions", "Scan"]),
    location: textFrom(currentStatus?.StatusLocation) || textFrom(latestScan?.ScannedLocation) || findNestedText(data, ["ScannedLocation", "location", "city"]),
    estimatedDelivery: textFrom(shipment?.PromisedDeliveryDate) || textFrom(shipment?.ExpectedDeliveryDate) || findNestedText(data, ["PromisedDeliveryDate", "ExpectedDeliveryDate", "edd", "etd"]),
    scans,
  }
}

function getDelhiveryBaseUrl() {
  return process.env.DELHIVERY_API_BASE || (process.env.DELHIVERY_ENV === "staging" ? DELHIVERY_STAGING_API_BASE : DELHIVERY_PRODUCTION_API_BASE)
}

function buildDelhiveryPayload(order: StoreOrder, pickupLocation: string, externalOrderId?: string) {
  const lineItems = buildDelhiveryLineItems(order)
  const itemSummary = lineItems
    .map((item, index) => {
      return `Item ${index + 1}: SKU ${item.sku} | ${item.name} | Size ${item.size} | Qty ${item.quantity} | Rs ${item.price}`
    })
    .join(" | ")
    .slice(0, 250)

  return {
    pickup_location: { name: pickupLocation },
    shipments: [{
      name: order.address.name,
      add: [order.address.houseNumber, order.address.address].filter(Boolean).join(", ").slice(0, 250),
      city: order.address.city,
      state: order.address.state,
      country: "India",
      pin: order.address.pincode,
      phone: order.address.phone,
      order: externalOrderId || order.id,
      payment_mode: order.status === "cod" ? "COD" : "Pre-paid",
      products_desc: itemSummary || "Football jersey",
      product_details: lineItems,
      quantity: order.items.reduce((sum, item) => sum + Math.max(0, Number(item.quantity || 0)), 0),
      cod_amount: order.status === "cod" ? Math.max(0, order.codBalance ?? order.total) : 0,
      total_amount: order.total,
      seller_add: process.env.DELHIVERY_SELLER_ADDRESS || process.env.BORZO_PICKUP_ADDRESS || "",
      seller_name: process.env.DELHIVERY_SELLER_NAME || "terrace.fc",
      seller_inv: order.id,
      shipment_width: Number(process.env.DELHIVERY_DEFAULT_WIDTH || 25),
      shipment_height: Number(process.env.DELHIVERY_DEFAULT_HEIGHT || 4),
      shipment_length: Number(process.env.DELHIVERY_DEFAULT_LENGTH || 30),
      weight: calculateOrderWeightKg(order),
    }],
  }
}

function buildDelhiveryLineItems(order: StoreOrder) {
  return order.items.map((item, index) => {
    const quantity = Math.max(1, Number(item.quantity || 1))
    const unitPrice = Math.max(0, Number(item.price || 0))
    const sku = isCustomJerseyItem(item) ? `TFC-CUS-${order.id}-${index + 1}` : getShippingSku(item)

    return {
      sku: sanitizeDelhiveryText(sku, 48),
      name: sanitizeDelhiveryText([item.name, item.club, item.season].filter(Boolean).join(" "), 90),
      size: sanitizeDelhiveryText(item.size, 16),
      quantity,
      price: unitPrice,
      total: unitPrice * quantity,
    }
  })
}

function isCustomJerseyItem(item: StoreOrder["items"][number]) {
  const mode = String(item.customization?.mode || "").toLowerCase()
  return Boolean(item.customization?.enabled || mode === "custom")
}

function sanitizeDelhiveryText(value: string, maxLength: number) {
  return String(value || "")
    .replace(/[&#%;\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
}

function getDelhiveryError(data: DelhiveryCreateResponse | null) {
  if (!data) return ""
  if (data.error) return data.error
  if (Array.isArray(data.remarks) && data.remarks.length) return data.remarks.join(", ")
  const packageRemarks = data.packages?.flatMap((item) => item.remarks || []).filter(Boolean)
  return packageRemarks?.length ? packageRemarks.join(", ") : ""
}

function textFrom(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim()
}

function firstNonEmpty(values: unknown[]) {
  for (const value of values) {
    const text = textFrom(value)
    if (text) return text
  }
  return ""
}

function findNestedText(source: unknown, keys: string[]) {
  const normalized = new Set(keys.map((key) => key.toLowerCase()))
  const queue = [source]

  while (queue.length) {
    const value = queue.shift()
    if (!value || typeof value !== "object") continue
    if (Array.isArray(value)) {
      queue.push(...value)
      continue
    }

    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (normalized.has(key.toLowerCase()) && child !== null && child !== undefined && String(child).trim()) {
        return String(child)
      }
      if (child && typeof child === "object") queue.push(child)
    }
  }

  return ""
}

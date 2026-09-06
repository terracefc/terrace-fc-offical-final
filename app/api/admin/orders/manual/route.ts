import { NextResponse } from "next/server"
import { createOrderId, type StoreOrder } from "@/lib/orders"
import { upsertStoredOrder } from "@/lib/order-storage"
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin"
import { sendOrderConfirmationEmails } from "@/lib/order-confirmation"
import { provisionCustomerAfterPayment } from "@/lib/customer-provisioning"
import { createDelhiveryOrder, isDelhiveryConfigured } from "@/lib/delhivery"

const ADMIN_COOKIE = "terrace_admin"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "Admin access is required." }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const order = normalizeManualOrder(body)
  if (!order) {
    return NextResponse.json({ error: "Manual order payload is incomplete." }, { status: 400 })
  }
  if (!isValidEmail(order.address.email)) {
    return NextResponse.json({ error: "A valid customer email is required for a manual order." }, { status: 400 })
  }

  // A manual sale should work exactly like a checkout: the customer can log in
  // with the supplied email and find both their saved delivery details and this order.
  let customer
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
    customer = provisioned.customer
    order.customerId = customer.id
    order.customerEmail = customer.email
    order.address.email = customer.email
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "The customer account could not be saved.",
    }, { status: 500 })
  }

  const saved = await saveOrder(order)
  if (!saved.ok) {
    return NextResponse.json({ error: saved.error || "Order could not be saved." }, { status: 500 })
  }

  // Match the normal checkout flow: create the Delhivery shipment before the
  // confirmation email so the customer receives the courier, AWB, and invoice
  // with the same shipment information.
  const delivery = await assignManualDelhiveryDelivery(order)
  const confirmationOrder = delivery.order
  const { customerResult, adminResult } = await sendOrderConfirmationEmails(confirmationOrder)

  return NextResponse.json({
    ok: true,
    order: confirmationOrder,
    customer,
    accountSaved: true,
    emailSent: customerResult.sent,
    adminEmailSent: adminResult.sent,
    ...(delivery.warning ? { warning: delivery.warning } : {}),
  })
}

function normalizeManualOrder(body: any): StoreOrder | null {
  const address = body?.address || {}
  const item = body?.item || {}
  const status = body?.status === "cod" ? "cod" : "paid"
  const quantity = Math.max(1, Number(item.quantity || 1))
  const price = Math.max(0, Number(item.price || 0))
  const deliveryCharge = Math.max(0, Number(body?.deliveryCharge || 0))
  const convenienceCharge = Math.max(0, Number(body?.convenienceCharge || 0))
  const discount = Math.max(0, Number(body?.discount || 0))
  const subtotal = Math.max(0, Number(body?.subtotal || price * quantity))
  const total = Math.max(0, Number(body?.total || subtotal + deliveryCharge + convenienceCharge - discount))
  const patches = Boolean(body?.patches || item.patches || item.customization?.patches)

  if (!item.name || !item.size) {
    return null
  }

  const email = normalizeEmail(address.email)

  return {
    id: body?.id || createOrderId(),
    customerEmail: email,
    createdAt: new Date().toISOString(),
    status,
    fulfillmentStatus: "confirmed",
    address: {
      name: textOrNA(address.name),
      phone: textOrNA(address.phone),
      email,
      houseNumber: textOrNA(address.houseNumber),
      address: textOrNA(address.address),
      deliveryInstructions: String(address.deliveryInstructions || "").trim() || undefined,
      country: String(address.country || "India").trim() || "India",
      city: textOrNA(address.city),
      state: textOrNA(address.state),
      pincode: textOrNA(address.pincode),
      latitude: parseCoordinate(address.latitude),
      longitude: parseCoordinate(address.longitude),
    },
    items: [{
      id: Number(item.id || Date.now()),
      name: String(item.name).trim(),
      club: String(item.club || "Manual Order").trim(),
      season: String(item.season || "Manual order").trim(),
      size: String(item.size).trim(),
      quantity,
      price,
      version: "fan",
      customization: {
        enabled: patches,
        mode: patches ? "original" : "plain",
        name: "",
        number: "",
        patches,
      },
    }],
    subtotal,
    deliveryCharge,
    convenienceCharge,
    discount,
    total,
  }
}

function textOrNA(value: unknown) {
  const text = String(value ?? "").trim()
  return text || "NA"
}

function normalizeEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase()
  return isValidEmail(email) ? email : "NA"
}

function isValidEmail(value: string) {
  return /^\S+@\S+\.\S+$/.test(value)
}

async function saveOrder(order: StoreOrder) {
  if (!isSupabaseAdminConfigured || !supabaseAdmin) {
    return { ok: false, error: "Order storage is not configured." }
  }

  const { error } = await supabaseAdmin.from("orders").upsert([orderToRow(order)], { onConflict: "id" })
  if (error) {
    if (isMissingOrdersTable(error.message)) {
      const stored = await upsertStoredOrder(order)
      return { ok: !stored.error, error: stored.error || null }
    }
    return { ok: false, error: error.message }
  }

  return { ok: true, error: null }
}

async function assignManualDelhiveryDelivery(order: StoreOrder) {
  const country = String(order.address.country || "India").trim().toLowerCase()
  if (country !== "india" || order.delhiveryWaybill) return { order }
  if (!isDelhiveryConfigured()) {
    return { order, warning: "Order saved, but Delhivery is not configured so no AWB was created." }
  }

  try {
    const shipment = await createDelhiveryOrder(order)
    const orderWithDelivery: StoreOrder = {
      ...order,
      ...shipment,
      fulfillmentStatus: "confirmed",
      shippingProvider: "delhivery",
      courierName: "Delhivery",
    }
    const saved = await saveOrder(orderWithDelivery)
    if (!saved.ok) throw new Error(saved.error || "The Delhivery shipment could not be saved.")
    return { order: orderWithDelivery }
  } catch (error) {
    const message = error instanceof Error ? error.message : "The Delhivery shipment could not be created."
    console.warn(`Automatic Delhivery waybill failed for manual order ${order.id}: ${message}`)
    return { order, warning: `Order saved, but the Delhivery AWB could not be created: ${message}` }
  }
}

function parseCoordinate(value: unknown) {
  const coordinate = Number(value)
  return Number.isFinite(coordinate) ? coordinate : undefined
}

function orderToRow(order: StoreOrder) {
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
    payment_id: order.paymentId,
    shipping_id: order.trackingNumber || order.shippingId,
    shipped_at: order.shippedAt,
    address: {
      ...order.address,
      __orderMeta: {
        convenienceCharge: order.convenienceCharge || 0,
        trackingNumber: order.trackingNumber || order.shippingId || "",
        courierName: order.courierName || "",
        shippingProvider: order.shippingProvider || "",
        delhiveryOrderId: order.delhiveryOrderId || "",
        delhiveryPickupId: order.delhiveryPickupId || "",
        delhiveryWaybill: order.delhiveryWaybill || "",
        delhiveryStatus: order.delhiveryStatus || "",
        delhiveryError: order.delhiveryError || "",
      },
    },
    items: order.items,
    created_at: order.createdAt,
  }
}

function isMissingOrdersTable(message?: string) {
  return String(message || "").toLowerCase().includes("could not find the table")
}

function isAdmin(request: Request) {
  return getCookie(request, ADMIN_COOKIE) === (process.env.ADMIN_SESSION_TOKEN || "terrace-admin-session")
}

function getCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") || ""
  const match = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : ""
}

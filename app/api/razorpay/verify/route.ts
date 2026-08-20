import crypto, { timingSafeEqual } from "crypto"
import { NextResponse } from "next/server"
import type { StoreOrder } from "@/lib/orders"
import { sendOrderConfirmationEmails } from "@/lib/order-confirmation"
import { CUSTOMER_COOKIE_NAME, provisionCustomerAfterPayment, type PendingCustomerIdentity } from "@/lib/customer-provisioning"
import { GOOGLE_PENDING_COOKIE } from "@/lib/google-auth"

type VerifyRequest = {
  razorpay_order_id?: string
  razorpay_payment_id?: string
  razorpay_signature?: string
  order?: StoreOrder
  account?: PendingCustomerIdentity & { phone?: string; password?: string }
}

export async function POST(request: Request) {
  const keySecret = process.env.RAZORPAY_KEY_SECRET

  if (!keySecret) {
    return NextResponse.json({ error: "Razorpay secret is missing." }, { status: 500 })
  }

  const body = (await request.json()) as VerifyRequest
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return NextResponse.json({ error: "Payment verification payload is incomplete." }, { status: 400 })
  }

  const expectedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex")

  if (!safeEqual(expectedSignature, razorpay_signature)) {
    return NextResponse.json({ error: "Payment signature mismatch.", verified: false }, { status: 400 })
  }

  if (!body.order) {
    return NextResponse.json({
      verified: true,
      orderSaved: false,
    })
  }

  const paidOrder: StoreOrder = {
    ...body.order,
    status: body.order.partialCod ? "cod" : "paid",
    paymentId: razorpay_payment_id,
    razorpayOrderId: razorpay_order_id,
  }

  const origin = getRequestOrigin(request)
  const saveResponse = await fetch(`${origin}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order: paidOrder }),
  })
  const saveData = await saveResponse.json().catch(() => null)

  if (!saveResponse.ok) {
    return NextResponse.json({
      verified: true,
      orderSaved: false,
      order: paidOrder,
      error: saveData?.error || "Payment verified but order could not be saved.",
    })
  }

  const savedOrder = (saveData?.order || paidOrder) as StoreOrder
  let customerResult: Awaited<ReturnType<typeof provisionCustomerAfterPayment>> | null = null
  if (body.account?.email) {
    try {
      customerResult = await provisionCustomerAfterPayment({
        email: body.account.email,
        name: body.account.name || savedOrder.address.name,
        googleSub: body.account.googleSub,
        phone: body.account.phone || savedOrder.address.phone,
        password: body.account.password,
        savedAddress: {
          houseNumber: savedOrder.address.houseNumber || "",
          address: savedOrder.address.address,
          deliveryInstructions: savedOrder.address.deliveryInstructions,
          country: savedOrder.address.country,
          city: savedOrder.address.city,
          state: savedOrder.address.state,
          pincode: savedOrder.address.pincode,
          latitude: savedOrder.address.latitude,
          longitude: savedOrder.address.longitude,
        },
      })
    } catch (error) {
      return NextResponse.json({
        verified: true,
        orderSaved: true,
        order: savedOrder,
        accountSaved: false,
        accountError: error instanceof Error ? error.message : "The account could not be saved.",
      })
    }
  }
  let emailSent = false
  let adminEmailSent = false

  // /api/orders creates the Delhivery shipment before returning whenever the
  // order is eligible, so this confirmation has the saved courier and AWB.
  const confirmation = await sendOrderConfirmationEmails(savedOrder)
  emailSent = confirmation.customerResult.sent
  adminEmailSent = confirmation.adminResult.sent

  const response = NextResponse.json({
    verified: true,
    orderSaved: true,
    order: savedOrder,
    emailSent,
    adminEmailSent,
    customer: customerResult?.customer || null,
  })
  if (customerResult) {
    response.cookies.set(CUSTOMER_COOKIE_NAME, customerResult.cookieValue, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    })
    response.cookies.delete(GOOGLE_PENDING_COOKIE)
  }
  return response
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function getRequestOrigin(request: Request) {
  const url = new URL(request.url)
  const forwardedHost = request.headers.get("x-forwarded-host")
  const forwardedProto = request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "")
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`
  return url.origin
}

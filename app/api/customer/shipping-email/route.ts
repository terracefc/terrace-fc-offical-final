import { NextResponse } from "next/server"
import { orderEmailHtml, sendEmail } from "@/lib/email"
import { getOrderDisplayId, type StoreOrder } from "@/lib/orders"

export async function POST(request: Request) {
  const order = await request.json().catch(() => null) as StoreOrder | null

  if (!order?.id || !order.address?.email || !order.shippingId) {
    return NextResponse.json({ error: "Valid shipped order with shipping ID is required." }, { status: 400 })
  }

  const result = await sendEmail({
    to: order.address.email,
    subject: `Your terrace.fc order has shipped - ${getOrderDisplayId(order)}`,
    html: orderEmailHtml(order, {
      label: "Shipping Update",
      heading: "Your jersey is on the way.",
      message: `Your order is moving through delivery. The same order summary is below for your reference.`,
    }),
  })

  return NextResponse.json({ ok: true, emailSent: result.sent })
}

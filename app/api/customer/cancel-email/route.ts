import { NextResponse } from "next/server"
import { sendEmail, cancellationEmailHtml } from "@/lib/email"
import { getOrderDisplayId, type StoreOrder } from "@/lib/orders"

export async function POST(request: Request) {
  const order = await request.json().catch(() => null) as StoreOrder | null

  if (!order?.id || !order.address?.email) {
    return NextResponse.json({ error: "Valid cancelled order is required." }, { status: 400 })
  }

  const result = await sendEmail({
    to: order.address.email,
    subject: `Your terrace.fc order has been cancelled - ${getOrderDisplayId(order)}`,
    html: cancellationEmailHtml(order),
  })

  return NextResponse.json({ ok: true, emailSent: result.sent })
}

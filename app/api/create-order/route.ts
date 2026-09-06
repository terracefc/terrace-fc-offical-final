import { NextResponse } from "next/server"
import { createRazorpayOrder } from "@/lib/razorpay"

type CreateOrderRequest = {
  amount?: number
  currency?: string
  receipt?: string
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as CreateOrderRequest | null
  const amountPaise = Number(body?.amount)

  if (!Number.isFinite(amountPaise) || amountPaise < 100) {
    return NextResponse.json({ error: "Amount must be at least 100 paise." }, { status: 400 })
  }

  const { order, error, status } = await createRazorpayOrder({
    amountPaise,
    currency: body?.currency || "INR",
    receipt: body?.receipt || `terrace_${Date.now()}`,
  })

  if (!order) {
    return NextResponse.json({ error }, { status })
  }

  return NextResponse.json({
    order_id: order.id,
    amount: order.amount,
    currency: order.currency,
  })
}

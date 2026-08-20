import Razorpay from "razorpay"

type CreateRazorpayOrderInput = {
  amountPaise: number
  currency?: string
  receipt?: string
  notes?: Record<string, string>
}

export function getRazorpayKeyId() {
  return process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || ""
}

export function getRazorpayKeySecret() {
  return process.env.RAZORPAY_KEY_SECRET || ""
}

export function getRazorpayClient() {
  const key_id = getRazorpayKeyId()
  const key_secret = getRazorpayKeySecret()

  if (!key_id || !key_secret) {
    return null
  }

  return new Razorpay({ key_id, key_secret })
}

export async function createRazorpayOrder({
  amountPaise,
  currency = "INR",
  receipt = `terrace_${Date.now()}`,
  notes = {},
}: CreateRazorpayOrderInput) {
  if (!Number.isFinite(amountPaise) || amountPaise < 100) {
    return { order: null, error: "Amount must be at least 100 paise.", status: 400 }
  }

  const razorpay = getRazorpayClient()
  if (!razorpay) {
    return { order: null, error: "Razorpay keys are missing.", status: 500 }
  }

  try {
    const order = await razorpay.orders.create({
      amount: Math.round(amountPaise),
      currency,
      receipt,
      notes,
    })

    return { order, error: null, status: 200 }
  } catch (error: any) {
    const status = Number(error?.statusCode || error?.status || 500)
    return {
      order: null,
      error: error?.error?.description || error?.message || "Razorpay order creation failed.",
      status: status === 401 ? 401 : 500,
    }
  }
}

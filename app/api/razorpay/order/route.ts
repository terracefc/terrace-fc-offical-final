import { NextResponse } from "next/server"
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin"
import { createRazorpayOrder, getRazorpayKeyId } from "@/lib/razorpay"

type OrderRequest = {
  amount?: number
  address?: {
    name?: string
    phone?: string
    email?: string
    address?: string
    city?: string
    state?: string
    pincode?: string
  }
  items?: Array<{
    id: number
    name: string
    club: string
    size: string
    quantity: number
    price: number
  }>
}

export async function POST(request: Request) {
  const keyId = getRazorpayKeyId()

  if (!keyId || !process.env.RAZORPAY_KEY_SECRET) {
    return NextResponse.json(
      { error: "Razorpay keys are missing. Add RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, and NEXT_PUBLIC_RAZORPAY_KEY_ID to your environment." },
      { status: 500 }
    )
  }

  const body = (await request.json()) as OrderRequest
  const testModeEnabled = await getTestModeEnabled()
  const itemCount = Array.isArray(body.items)
    ? body.items.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0)
    : 0
  const amount = testModeEnabled ? Math.max(1, itemCount) : Number(body.amount)

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Invalid order amount." }, { status: 400 })
  }

  if (!body.address?.name || !body.address.phone || !body.address.email || !body.address.address || !body.address.city || !body.address.state || !body.address.pincode) {
    return NextResponse.json({ error: "Delivery address is incomplete." }, { status: 400 })
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "Cart is empty." }, { status: 400 })
  }

  const { order, error, status } = await createRazorpayOrder({
    amountPaise: Math.round(amount * 100),
    receipt: `terrace_${Date.now()}`,
    notes: {
      customer_name: body.address.name,
      customer_phone: body.address.phone,
      customer_email: body.address.email,
      city: body.address.city,
      state: body.address.state,
      pincode: body.address.pincode,
      items: body.items.map((item) => `${item.name} ${item.size} x${item.quantity}`).join(", ").slice(0, 240),
    },
  })

  if (!order) {
    return NextResponse.json({ error }, { status })
  }

  return NextResponse.json({
    keyId,
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
  })
}

async function getTestModeEnabled() {
  if (!isSupabaseAdminConfigured || !supabaseAdmin) return false

  const { data, error } = await supabaseAdmin.auth.admin.listUsers()
  if (error) return false

  const settingsUser = data.users.find((user) => user.email?.toLowerCase() === "site-settings@terracefc.local")
  return settingsUser?.user_metadata?.site_settings?.testModeEnabled === true
}

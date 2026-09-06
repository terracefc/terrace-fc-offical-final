import { NextResponse } from "next/server"
import { upsertStoredCustomerAccount } from "@/lib/customer-account-storage"
import { findSupabaseAuthUserByEmail, isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin"

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const firstName = String(body?.firstName || "").trim()
  const lastName = String(body?.lastName || "").trim()
  const email = String(body?.email || "").trim().toLowerCase()
  const phone = String(body?.phone || "").replace(/\D/g, "").slice(-10)

  if (!firstName || !lastName) return NextResponse.json({ error: "First and last name are required." }, { status: 400 })
  if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "A valid email is required." }, { status: 400 })
  if (!/^[6-9]\d{9}$/.test(phone)) return NextResponse.json({ error: "A valid mobile number is required." }, { status: 400 })
  if (!isSupabaseAdminConfigured || !supabaseAdmin) return NextResponse.json({ error: "Customer profiles are not configured locally." }, { status: 500 })

  const existing = await findSupabaseAuthUserByEmail(email)
  if (existing.error) return NextResponse.json({ error: existing.error }, { status: 500 })
  if (!existing.user) return NextResponse.json({ error: "Login is required before saving your profile." }, { status: 401 })

  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(existing.user.id, {
    user_metadata: {
      ...existing.user.user_metadata,
      name: `${firstName} ${lastName}`.trim(),
      phone,
      auth_provider: existing.user.user_metadata?.auth_provider || "email",
    },
  })
  if (error || !data.user) return NextResponse.json({ error: error?.message || "The customer profile could not be saved." }, { status: 500 })

  const customer = {
    id: data.user.user_metadata?.customer_id || data.user.id,
    name: data.user.user_metadata?.name || `${firstName} ${lastName}`.trim(),
    email: data.user.email || email,
    phone: data.user.user_metadata?.phone || phone,
    createdAt: data.user.created_at || new Date().toISOString(),
  }
  await upsertStoredCustomerAccount(customer)
  return NextResponse.json({ customer })
}

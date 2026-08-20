import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { upsertStoredCustomerAccount } from "@/lib/customer-account-storage"
import { GOOGLE_CUSTOMER_COOKIE, GOOGLE_PENDING_COOKIE, signCustomerPayload, verifyPendingGoogleProfile } from "@/lib/google-auth"
import { findSupabaseAuthUserByEmail, isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const email = String(body?.email || "").trim().toLowerCase()
  const phone = String(body?.phone || "").replace(/\D/g, "").slice(-10)
  const name = String(body?.name || "").trim()

  if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 })
  if (phone && !/^[6-9]\d{9}$/.test(phone)) return NextResponse.json({ error: "Enter a valid 10-digit Indian phone number." }, { status: 400 })
  if (name.length < 2) return NextResponse.json({ error: "Enter your full name." }, { status: 400 })

  const cookieStore = await cookies()
  const pendingValue = cookieStore.get(GOOGLE_PENDING_COOKIE)?.value || ""
  const pendingProfile = verifyPendingGoogleProfile(pendingValue)
  if (pendingValue && (!pendingProfile || pendingProfile.email.toLowerCase() !== email)) {
    return NextResponse.json({ error: "Your Google registration session expired. Please start again." }, { status: 400 })
  }

  const existing = await findSupabaseAuthUserByEmail(email)
  if (existing.error) return NextResponse.json({ error: existing.error }, { status: 500 })
  if (existing.user) return NextResponse.json({ error: "An account with this email already exists. Please log in." }, { status: 409 })

  const customerId = `CUS-${randomUUID().slice(0, 8).toUpperCase()}`
  const customer = {
    id: customerId,
    name,
    email,
    phone,
    createdAt: new Date().toISOString(),
  }

  if (isSupabaseAdminConfigured && supabaseAdmin) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        customer_id: customerId,
        name,
        phone,
        ...(pendingProfile ? { google_sub: pendingProfile.sub } : {}),
      },
    })
    if (error || !data.user) return NextResponse.json({ error: error?.message || "Could not create your account." }, { status: 500 })
  }

  await upsertStoredCustomerAccount(customer)
  const response = NextResponse.json({ ok: true, customer })
  response.cookies.set(GOOGLE_CUSTOMER_COOKIE, signCustomerPayload(customer), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  })
  response.cookies.delete(GOOGLE_PENDING_COOKIE)
  return response
}

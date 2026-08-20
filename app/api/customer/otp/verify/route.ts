import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { createHmac, timingSafeEqual } from "crypto"
import { findSupabaseAuthUserByEmail, isSupabaseAdminConfigured } from "@/lib/supabase-admin"
import { readStoredCustomerAccounts } from "@/lib/customer-account-storage"
import { GOOGLE_CUSTOMER_COOKIE, signCustomerPayload } from "@/lib/google-auth"
import type { CustomerAccount } from "@/lib/customer-auth"

export const runtime = "nodejs"

const OTP_COOKIE = "terrace_email_otp"

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const email = String(body?.email || "").trim().toLowerCase()
  const code = String(body?.code || "").trim()
  if (!/^\S+@\S+\.\S+$/.test(email) || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Email and 6-digit verification code are required." }, { status: 400 })
  }

  const cookieStore = await cookies()
  const stored = cookieStore.get(OTP_COOKIE)?.value || ""
  const [payload, signature] = stored.split(".")
  if (!payload || !signature || !safeEqual(signature, sign(payload))) {
    return NextResponse.json({ error: "That verification code has expired. Please request a new one." }, { status: 400 })
  }

  let parsed: { email?: string; code?: string; expiresAt?: number; isNewAccount?: boolean }
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
  } catch {
    return NextResponse.json({ error: "That verification code is invalid." }, { status: 400 })
  }

  if (parsed.email !== email || parsed.code !== code || !parsed.expiresAt || parsed.expiresAt < Date.now()) {
    return NextResponse.json({ error: "That verification code is incorrect or expired." }, { status: 400 })
  }

  const customer = await findCustomer(email)
  if (!customer) {
    const response = NextResponse.json({ ok: true, requiresProfile: true, email })
    response.cookies.delete(OTP_COOKIE)
    return response
  }

  const response = NextResponse.json({ ok: true, customer })
  response.cookies.set(GOOGLE_CUSTOMER_COOKIE, signCustomerPayload(customer), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  })
  response.cookies.delete(OTP_COOKIE)
  return response
}

async function findCustomer(email: string): Promise<CustomerAccount | null> {
  if (isSupabaseAdminConfigured) {
    const result = await findSupabaseAuthUserByEmail(email)
    if (result.user) {
      return {
        id: result.user.user_metadata?.customer_id || result.user.id,
        name: result.user.user_metadata?.name || email.split("@")[0] || "Customer",
        email: result.user.email || email,
        phone: result.user.user_metadata?.phone || "",
        createdAt: result.user.created_at || new Date().toISOString(),
        savedAddress: result.user.user_metadata?.saved_address || undefined,
      }
    }
  }

  const stored = await readStoredCustomerAccounts()
  return stored.accounts.find((account) => account.email.toLowerCase() === email) || null
}

function sign(value: string) {
  return createHmac("sha256", process.env.GOOGLE_AUTH_SECRET || process.env.OTP_SECRET || "terrace-google-auth-secret")
    .update(value)
    .digest("base64url")
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

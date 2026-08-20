import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { createHmac, randomInt } from "crypto"
import { emailOtpHtml, sendEmail } from "@/lib/email"
import { findSupabaseAuthUserByEmail, isSupabaseAdminConfigured } from "@/lib/supabase-admin"
import { readStoredCustomerAccounts } from "@/lib/customer-account-storage"

export const runtime = "nodejs"

const OTP_COOKIE = "terrace_email_otp"

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const email = String(body?.email || "").trim().toLowerCase()
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 })
  }

  const exists = await hasExistingAccount(email)

  const code = String(randomInt(100000, 1000000))
  const payload = encodePayload({ email, code, expiresAt: Date.now() + 10 * 60 * 1000, isNewAccount: !exists })
  const signedPayload = `${payload}.${sign(payload)}`
  let result
  try {
    result = await sendEmail({
      to: email,
      subject: "Your terrace.fc verification code",
      html: emailOtpHtml(code),
    })
  } catch (error) {
    console.error("[otp email failed]", error)
    return NextResponse.json({ error: "Could not prepare the verification email. Please try again." }, { status: 500 })
  }

  if (!result.sent) return NextResponse.json({ error: result.reason || "Could not send the verification email." }, { status: 500 })

  const cookieStore = await cookies()
  cookieStore.set(OTP_COOKIE, signedPayload, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60,
  })

  return NextResponse.json({ ok: true, isNewAccount: !exists })
}

async function hasExistingAccount(email: string) {
  if (isSupabaseAdminConfigured) {
    const result = await findSupabaseAuthUserByEmail(email)
    if (result.error) throw new Error(result.error)
    if (result.user) return true
  }

  const stored = await readStoredCustomerAccounts()
  return stored.accounts.some((account) => account.email.toLowerCase() === email)
}

function encodePayload(value: object) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url")
}

function sign(value: string) {
  return createHmac("sha256", process.env.GOOGLE_AUTH_SECRET || process.env.OTP_SECRET || "terrace-google-auth-secret")
    .update(value)
    .digest("base64url")
}

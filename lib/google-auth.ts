import { createHmac, randomUUID, timingSafeEqual } from "crypto"
import { upsertStoredCustomerAccount } from "@/lib/customer-account-storage"
import { findSupabaseAuthUserByEmail, isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin"
import type { CustomerAccount } from "@/lib/customer-auth"

export const GOOGLE_OAUTH_STATE_COOKIE = "terrace_google_oauth_state"
export const GOOGLE_CUSTOMER_COOKIE = "terrace_google_customer"
export const GOOGLE_REDIRECT_COOKIE = "terrace_google_redirect"
export const GOOGLE_PENDING_COOKIE = "terrace_google_pending"

type GoogleProfile = {
  sub: string
  email: string
  email_verified?: boolean
  name?: string
}

export type PendingGoogleProfile = Pick<GoogleProfile, "sub" | "email" | "name">

export function getGoogleRedirectUri(request: Request) {
  const configured = process.env.GOOGLE_REDIRECT_URI
  if (configured) return configured

  const url = new URL(request.url)
  const origin = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || url.origin
  return `${origin.replace(/\/$/, "")}/api/auth/callback/google`
}

export function createGoogleAuthUrl(request: Request, state: string, loginHint = "") {
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) return null

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getGoogleRedirectUri(request),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  })

  if (/^\S+@\S+\.\S+$/.test(loginHint.trim())) params.set("login_hint", loginHint.trim().toLowerCase())

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export async function exchangeGoogleCode(request: Request, code: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error("Google login is not configured.")
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getGoogleRedirectUri(request),
      grant_type: "authorization_code",
    }),
  })

  const token = await response.json()
  if (!response.ok || !token.access_token) {
    throw new Error(token.error_description || token.error || "Google login failed.")
  }

  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  })
  const profile = await profileResponse.json() as GoogleProfile

  if (!profileResponse.ok || !profile.email || profile.email_verified === false) {
    throw new Error("Google email could not be verified.")
  }

  return profile
}

export async function upsertGoogleCustomer(profile: GoogleProfile, signupPhone = ""): Promise<CustomerAccount> {
  const email = profile.email.trim().toLowerCase()
  const name = profile.name?.trim() || email.split("@")[0] || "Customer"
  const phone = sanitizeIndianPhone(signupPhone)

  if (!isSupabaseAdminConfigured || !supabaseAdmin) {
    const customer = {
      id: `CUS-${randomUUID().slice(0, 8).toUpperCase()}`,
      name,
      email,
      phone,
      createdAt: new Date().toISOString(),
    }
    await upsertStoredCustomerAccount(customer)
    return customer
  }

  const existing = await findSupabaseAuthUserByEmail(email)
  if (existing.error) throw new Error(existing.error)

  const existingPhone = sanitizeIndianPhone(existing.user?.user_metadata?.phone || "")
  const customerId = existing.user?.user_metadata?.customer_id || `CUS-${randomUUID().slice(0, 8).toUpperCase()}`
  const userMetadata = {
    ...(existing.user?.user_metadata || {}),
    customer_id: customerId,
    name: existing.user?.user_metadata?.name || name,
    phone: existingPhone || phone,
    google_sub: profile.sub,
  }

  if (existing.user) {
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(existing.user.id, {
      email_confirm: true,
      user_metadata: userMetadata,
    })
    if (error || !data.user) throw new Error(error?.message || "Could not update Google account.")
    const customer = mapUserToCustomer(data.user)
    await upsertStoredCustomerAccount(customer)
    return customer
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: userMetadata,
  })

  if (error || !data.user) throw new Error(error?.message || "Could not create Google account.")
  const customer = mapUserToCustomer(data.user)
  await upsertStoredCustomerAccount(customer)
  return customer
}

export function signCustomerPayload(customer: CustomerAccount) {
  const encoded = Buffer.from(JSON.stringify(customer), "utf8").toString("base64url")
  const signature = createHmac("sha256", process.env.GOOGLE_AUTH_SECRET || process.env.OTP_SECRET || "terrace-google-auth-secret")
    .update(encoded)
    .digest("base64url")

  return `${encoded}.${signature}`
}

export function verifyCustomerPayload(value: string): CustomerAccount | null {
  const [encoded, signature] = value.split(".")
  if (!encoded || !signature) return null

  const expected = createHmac("sha256", process.env.GOOGLE_AUTH_SECRET || process.env.OTP_SECRET || "terrace-google-auth-secret")
    .update(encoded)
    .digest("base64url")

  if (!safeEqual(signature, expected)) return null

  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as CustomerAccount
  } catch {
    return null
  }
}

export function signPendingGoogleProfile(profile: PendingGoogleProfile) {
  const encoded = Buffer.from(JSON.stringify(profile), "utf8").toString("base64url")
  return `${encoded}.${signAuthValue(encoded)}`
}

export function verifyPendingGoogleProfile(value: string): PendingGoogleProfile | null {
  const [encoded, signature] = value.split(".")
  if (!encoded || !signature || !safeEqual(signature, signAuthValue(encoded))) return null

  try {
    const profile = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as PendingGoogleProfile
    if (!profile.email || !profile.sub) return null
    return profile
  } catch {
    return null
  }
}

function mapUserToCustomer(user: any): CustomerAccount {
  return {
    id: user.user_metadata?.customer_id || user.id,
    name: user.user_metadata?.name || user.email?.split("@")[0] || "Customer",
    email: user.email || "",
    phone: user.user_metadata?.phone || "",
    createdAt: user.created_at || new Date().toISOString(),
  }
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function signAuthValue(value: string) {
  return createHmac("sha256", process.env.GOOGLE_AUTH_SECRET || process.env.OTP_SECRET || "terrace-google-auth-secret")
    .update(value)
    .digest("base64url")
}

function sanitizeIndianPhone(value: string) {
  const phone = value.replace(/\D/g, "").slice(-10)
  return /^[6-9]\d{9}$/.test(phone) ? phone : ""
}

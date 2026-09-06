import { createHmac, timingSafeEqual } from "crypto"

const TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

export function createRedeliveryToken(orderId: string, email: string) {
  const payload = Buffer.from(JSON.stringify({
    orderId,
    email: email.trim().toLowerCase(),
    createdAt: Date.now(),
  }), "utf8").toString("base64url")
  return `${payload}.${sign(payload)}`
}

export function verifyRedeliveryToken(token: string) {
  const [payload, signature] = token.split(".")
  if (!payload || !signature || !safeEqual(signature, sign(payload))) return null

  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
    if (!value.orderId || !value.email || !Number.isFinite(value.createdAt)) return null
    if (Date.now() - value.createdAt > TOKEN_MAX_AGE_MS) return null
    return {
      orderId: String(value.orderId),
      email: String(value.email).toLowerCase(),
    }
  } catch {
    return null
  }
}

export function getRedeliveryUrl(orderId: string, email: string) {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")).replace(/\/$/, "")
  return `${origin}/redelivery/${encodeURIComponent(createRedeliveryToken(orderId, email))}`
}

function sign(payload: string) {
  return createHmac("sha256", process.env.REDELIVERY_SECRET || process.env.OTP_SECRET || "terrace-redelivery-secret")
    .update(payload)
    .digest("base64url")
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

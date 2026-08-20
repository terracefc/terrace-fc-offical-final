import { NextRequest, NextResponse } from "next/server"

const ADMIN_COOKIE = "terrace_admin"
const DEFAULT_ALLOWED_ADMIN_IP = "122.171.19.152"
const ADMIN_SESSION_MAX_AGE = 60 * 60 * 24 * 365

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const password = String(body?.password || "")
  const adminPassword = process.env.ADMIN_PASSWORD || "Vishrut@2026"
  const token = process.env.ADMIN_SESSION_TOKEN || "terrace-admin-session"

  if (!password) {
    return NextResponse.json({ ok: false, message: "Password is required" }, { status: 400 })
  }

  if (password !== adminPassword) {
    return NextResponse.json({ ok: false, message: "Invalid password" }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE,
  })

  return response
}

function isAllowedAdminIp(request: NextRequest) {
  const allowedIp = process.env.SITE_LOCKDOWN_ALLOWED_IP || DEFAULT_ALLOWED_ADMIN_IP
  return Boolean(allowedIp && getClientIp(request) === allowedIp)
}

function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return (
    forwardedFor ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    ""
  )
}

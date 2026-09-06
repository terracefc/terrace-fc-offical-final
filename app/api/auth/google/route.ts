import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { createGoogleAuthUrl, GOOGLE_OAUTH_STATE_COOKIE, GOOGLE_REDIRECT_COOKIE } from "@/lib/google-auth"

export async function GET(request: Request) {
  const state = randomUUID()
  const requestUrl = new URL(request.url)
  const redirectTarget = sanitizeRedirect(requestUrl.searchParams.get("redirect_url") || "")
  const loginHint = sanitizeEmail(requestUrl.searchParams.get("email") || "")
  const authUrl = createGoogleAuthUrl(request, state, loginHint)

  if (!authUrl) {
    return NextResponse.redirect(new URL("/login?error=google_not_configured", request.url))
  }

  const cookieStore = await cookies()
  cookieStore.set(GOOGLE_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60,
  })
  cookieStore.set(GOOGLE_REDIRECT_COOKIE, redirectTarget, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60,
  })

  return NextResponse.redirect(authUrl)
}

function sanitizeRedirect(value: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/"
  if (value.startsWith("/login") || value.startsWith("/signup") || value.startsWith("/auth/")) return "/"
  return value
}

function sanitizeEmail(value: string) {
  const email = value.trim().toLowerCase()
  return /^\S+@\S+\.\S+$/.test(email) ? email : ""
}

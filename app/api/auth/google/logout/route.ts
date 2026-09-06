import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { GOOGLE_CUSTOMER_COOKIE, GOOGLE_OAUTH_STATE_COOKIE, GOOGLE_PENDING_COOKIE, GOOGLE_REDIRECT_COOKIE } from "@/lib/google-auth"

export async function POST() {
  await cookies()
  const response = NextResponse.json({ ok: true })
  for (const cookieName of [GOOGLE_CUSTOMER_COOKIE, GOOGLE_OAUTH_STATE_COOKIE, GOOGLE_PENDING_COOKIE, GOOGLE_REDIRECT_COOKIE]) {
    response.cookies.set(cookieName, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: new Date(0),
      maxAge: 0,
    })
  }
  response.headers.set("Cache-Control", "no-store")
  return response
}

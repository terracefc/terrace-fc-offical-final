import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import {
  exchangeGoogleCode,
  GOOGLE_CUSTOMER_COOKIE,
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_REDIRECT_COOKIE,
  signCustomerPayload,
  upsertGoogleCustomer,
} from "@/lib/google-auth"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code") || ""
  const state = url.searchParams.get("state") || ""
  const cookieStore = await cookies()
  const expectedState = cookieStore.get(GOOGLE_OAUTH_STATE_COOKIE)?.value || ""
  const redirectTarget = cookieStore.get(GOOGLE_REDIRECT_COOKIE)?.value || "/"
  cookieStore.delete(GOOGLE_OAUTH_STATE_COOKIE)
  cookieStore.delete(GOOGLE_REDIRECT_COOKIE)

  if (!code || !state || state !== expectedState) {
    return NextResponse.redirect(new URL("/login?error=google_state", request.url))
  }

  try {
    const profile = await exchangeGoogleCode(request, code)
    // Google already gives us a verified email and name, so create/update the
    // customer immediately instead of sending them through a separate form.
    const customer = await upsertGoogleCustomer(profile)
    const completeUrl = new URL("/auth/google/complete", request.url)
    if (redirectTarget && redirectTarget !== "/") completeUrl.searchParams.set("redirect_url", redirectTarget)
    const response = NextResponse.redirect(completeUrl)

    response.cookies.set(GOOGLE_CUSTOMER_COOKIE, signCustomerPayload(customer), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    })

    return response
  } catch (error) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("error", error instanceof Error ? error.message : "google_failed")
    return NextResponse.redirect(loginUrl)
  }
}

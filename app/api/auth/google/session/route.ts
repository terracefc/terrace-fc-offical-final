import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { GOOGLE_CUSTOMER_COOKIE, verifyCustomerPayload } from "@/lib/google-auth"

export async function GET() {
  const cookieStore = await cookies()
  const value = cookieStore.get(GOOGLE_CUSTOMER_COOKIE)?.value || ""
  const customer = value ? verifyCustomerPayload(value) : null

  if (!customer) {
    return NextResponse.json({ error: "Google login session expired." }, { status: 400 })
  }

  return NextResponse.json({ customer })
}

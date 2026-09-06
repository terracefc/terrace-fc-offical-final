import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { GOOGLE_PENDING_COOKIE, verifyPendingGoogleProfile } from "@/lib/google-auth"

export async function GET() {
  const cookieStore = await cookies()
  const profile = verifyPendingGoogleProfile(cookieStore.get(GOOGLE_PENDING_COOKIE)?.value || "")
  if (!profile) return NextResponse.json({ identity: null })

  return NextResponse.json({
    identity: { email: profile.email, name: profile.name || "", googleSub: profile.sub },
  })
}

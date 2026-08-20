import { NextResponse } from "next/server"
import { loginNoticeEmailHtml, sendEmail } from "@/lib/email"

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const email = String(body?.email || "").trim().toLowerCase()
  const name = String(body?.name || "").trim() || email.split("@")[0] || "Customer"

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: "Valid email is required." }, { status: 400 })
  }

  const result = await sendEmail({
    to: email,
    subject: "New terrace.fc login",
    html: loginNoticeEmailHtml(name),
  })

  return NextResponse.json({ ok: true, sent: result.sent })
}

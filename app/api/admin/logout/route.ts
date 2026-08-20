import { NextRequest, NextResponse } from "next/server"

const ADMIN_COOKIE = "terrace_admin"

export async function POST(request: NextRequest) {
  const accept = request.headers.get("accept") || ""
  const response = accept.includes("text/html")
    ? NextResponse.redirect(new URL("/admin/login", request.url))
    : NextResponse.json({ ok: true })

  response.cookies.delete(ADMIN_COOKIE)
  return response
}

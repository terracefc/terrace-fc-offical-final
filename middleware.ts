import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const ADMIN_COOKIE = "terrace_admin"
const DEFAULT_ALLOWED_IP = "122.171.19.152"
const ADMIN_SESSION_MAX_AGE = 60 * 60 * 24 * 365

type SiteSettings = { allowedIp: string }

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = process.env.ADMIN_SESSION_TOKEN || "terrace-admin-session"
  const cookie = request.cookies.get(ADMIN_COOKIE)?.value

  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    const settings = await getSiteSettings()
    const allowedIp = settings.allowedIp || process.env.SITE_LOCKDOWN_ALLOWED_IP || DEFAULT_ALLOWED_IP
    const isAllowedAdminIp = getClientIp(request) === allowedIp
    if (isAllowedAdminIp) {
      if (pathname === "/admin/login") {
        const response = NextResponse.redirect(new URL("/admin", request.url))
        setAdminCookie(response, token, ADMIN_SESSION_MAX_AGE)
        return response
      }
      const response = NextResponse.next()
      setAdminCookie(response, token, ADMIN_SESSION_MAX_AGE)
      return response
    }

    if (pathname === "/admin/login" && cookie === token) {
      const response = NextResponse.redirect(new URL("/admin", request.url))
      setAdminCookie(response, token, ADMIN_SESSION_MAX_AGE)
      return response
    }

    if (!pathname.startsWith("/admin") || pathname === "/admin/login" || cookie === token) {
      const response = NextResponse.next()
      if (cookie === token) setAdminCookie(response, token, ADMIN_SESSION_MAX_AGE)
      return response
    }

    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = "/admin/login"
    loginUrl.searchParams.set("next", pathname)
    return NextResponse.redirect(loginUrl)
  }

  const response = NextResponse.next()
  if (cookie === token) setAdminCookie(response, token, ADMIN_SESSION_MAX_AGE)
  return response
}

function setAdminCookie(response: NextResponse, token: string, maxAge: number) {
  response.cookies.set(ADMIN_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge })
}

function getClientIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || request.headers.get("cf-connecting-ip") || ""
}

async function getSiteSettings(): Promise<SiteSettings> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SECRET_KEY
  if (!supabaseUrl || !serviceKey) return { allowedIp: DEFAULT_ALLOWED_IP }

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }, cache: "no-store" })
    if (!response.ok) return { allowedIp: DEFAULT_ALLOWED_IP }
    const data = await response.json()
    const settings = data.users?.find((user: any) => user.email === "site-settings@terracefc.local")?.user_metadata?.site_settings
    return { allowedIp: typeof settings?.allowedIp === "string" && settings.allowedIp ? settings.allowedIp : DEFAULT_ALLOWED_IP }
  } catch {
    return { allowedIp: DEFAULT_ALLOWED_IP }
  }
}

export const config = {
  matcher: ["/(api|trpc)(.*)", "/admin/:path*", "/((?!_next/static|_next/image|favicon.ico|icon.svg|icon-light-32x32.png|icon-dark-32x32.png|apple-icon.png|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js)$).*)"],
}

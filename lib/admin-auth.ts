export const ADMIN_COOKIE = "terrace_admin"
export const DEFAULT_ALLOWED_ADMIN_IP = "122.171.19.152"

export function getAdminSessionToken() {
  return process.env.ADMIN_SESSION_TOKEN || "terrace-admin-session"
}

export function isAdminRequest(request: Request) {
  return getCookie(request, ADMIN_COOKIE) === getAdminSessionToken() || isAllowedAdminIp(request)
}

export function isAllowedAdminIp(request: Request) {
  const allowedIp = process.env.SITE_LOCKDOWN_ALLOWED_IP || DEFAULT_ALLOWED_ADMIN_IP
  return Boolean(allowedIp && getClientIp(request) === allowedIp)
}

export function getCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") || ""
  const match = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : ""
}

export function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return (
    forwardedFor ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    ""
  )
}

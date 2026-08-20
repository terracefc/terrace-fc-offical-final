import { NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { defaultSiteSettings, normalizeSiteSettings } from "@/lib/site-settings"
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin"

const ADMIN_COOKIE = "terrace_admin"
const SETTINGS_EMAIL = "site-settings@terracefc.local"

export async function GET(request: Request) {
  const settings = await readSiteSettings()
  return NextResponse.json({
    settings,
    clientIp: getClientIp(request),
  })
}

export async function POST(request: Request) {
  const isAdmin = getCookie(request, ADMIN_COOKIE) === (process.env.ADMIN_SESSION_TOKEN || "terrace-admin-session")
  if (!isAdmin) {
    return NextResponse.json({ error: "Admin access is required." }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const settings = normalizeSiteSettings(body?.settings)
  const saved = await saveSiteSettings(settings)

  if (!saved) {
    return NextResponse.json({ error: "Site settings storage is not configured." }, { status: 500 })
  }

  return NextResponse.json({ settings })
}

async function readSiteSettings() {
  if (!isSupabaseAdminConfigured || !supabaseAdmin) {
    return defaultSiteSettings
  }

  const user = await findSettingsUser()
  return normalizeSiteSettings(user?.user_metadata?.site_settings)
}

async function saveSiteSettings(settings: unknown) {
  if (!isSupabaseAdminConfigured || !supabaseAdmin) {
    return false
  }

  const existingUser = await findSettingsUser()
  const metadata = { site_settings: settings }

  if (existingUser) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
      user_metadata: {
        ...existingUser.user_metadata,
        ...metadata,
      },
    })
    return !error
  }

  const { error } = await supabaseAdmin.auth.admin.createUser({
    email: SETTINGS_EMAIL,
    password: randomUUID(),
    email_confirm: true,
    user_metadata: metadata,
  })

  return !error
}

async function findSettingsUser() {
  if (!supabaseAdmin) return null

  const { data, error } = await supabaseAdmin.auth.admin.listUsers()
  if (error) return null

  return data.users.find((user) => user.email?.toLowerCase() === SETTINGS_EMAIL) || null
}

function getCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") || ""
  const match = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : ""
}

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return (
    forwardedFor ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    ""
  )
}

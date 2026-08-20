import { NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { defaultHomepageContent, normalizeHomepageContent } from "@/lib/homepage-content"
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin"

const ADMIN_COOKIE = "terrace_admin"
const CONTENT_EMAIL = "site-content@terracefc.local"

export const dynamic = "force-dynamic"

export async function GET() {
  const content = await readHomepageContent()
  return NextResponse.json({ content })
}

export async function POST(request: Request) {
  const isAdmin = getCookie(request, ADMIN_COOKIE) === (process.env.ADMIN_SESSION_TOKEN || "terrace-admin-session")
  if (!isAdmin) {
    return NextResponse.json({ error: "Admin access is required." }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const content = normalizeHomepageContent(body?.content)
  const saved = await saveHomepageContent(content)

  if (!saved) {
    return NextResponse.json({ error: "Homepage storage is not configured." }, { status: 500 })
  }

  return NextResponse.json({ content })
}

async function readHomepageContent() {
  if (!isSupabaseAdminConfigured || !supabaseAdmin) {
    return defaultHomepageContent
  }

  const user = await findContentUser()
  return normalizeHomepageContent(user?.user_metadata?.homepage_content)
}

async function saveHomepageContent(content: unknown) {
  if (!isSupabaseAdminConfigured || !supabaseAdmin) {
    return false
  }

  const existingUser = await findContentUser()
  const metadata = { homepage_content: content }

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
    email: CONTENT_EMAIL,
    password: randomUUID(),
    email_confirm: true,
    user_metadata: metadata,
  })

  return !error
}

async function findContentUser() {
  if (!supabaseAdmin) return null

  const { data, error } = await supabaseAdmin.auth.admin.listUsers()
  if (error) return null

  return data.users.find((user) => user.email?.toLowerCase() === CONTENT_EMAIL) || null
}

function getCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") || ""
  const match = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : ""
}

import { NextResponse } from "next/server"
import { normalizeNewsletterSubscribers } from "@/lib/newsletter"
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin"

const NEWSLETTER_EMAIL = "newsletter@terracefc.local"

export async function GET(request: Request) {
  if (!isAdmin(request)) return NextResponse.json({ error: "Admin access is required." }, { status: 401 })

  const { subscribers, error } = await readSubscribers()
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json({ subscribers })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const email = String(body?.email || "").trim().toLowerCase()

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 })
  }

  if (!isSupabaseAdminConfigured || !supabaseAdmin) {
    return NextResponse.json({ ok: true, stored: false })
  }

  const { subscribers, error } = await readSubscribers()
  if (error) return NextResponse.json({ error }, { status: 500 })

  const next = [
    { email, createdAt: new Date().toISOString(), source: "footer" },
    ...subscribers.filter((subscriber) => subscriber.email !== email),
  ]

  const saved = await saveSubscribers(next)
  if (saved) return NextResponse.json({ ok: true, stored: true, subscribers: next.length })
  return NextResponse.json({ error: "Newsletter storage is not configured." }, { status: 500 })
}

async function readSubscribers() {
  const user = await getNewsletterUser()
  if (!user) return { subscribers: [] as ReturnType<typeof normalizeNewsletterSubscribers>, error: null }
  return {
    subscribers: normalizeNewsletterSubscribers(user.user_metadata?.newsletter_subscribers),
    error: null,
  }
}

async function saveSubscribers(subscribers: ReturnType<typeof normalizeNewsletterSubscribers>) {
  const user = await getNewsletterUser()
  if (!user) return false

  const { error } = await supabaseAdmin!.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...(user.user_metadata || {}),
      newsletter_subscribers: subscribers,
    },
  })

  return !error
}

async function getNewsletterUser() {
  if (!supabaseAdmin) return null

  const existing = await supabaseAdmin.auth.admin.listUsers()
  if (!existing.error) {
    const user = existing.data.users.find((candidate) => candidate.email?.toLowerCase() === NEWSLETTER_EMAIL)
    if (user) return user
  }

  const created = await supabaseAdmin.auth.admin.createUser({
    email: NEWSLETTER_EMAIL,
    email_confirm: true,
    user_metadata: { newsletter_subscribers: [] },
  })

  return created.data.user || null
}

function isAdmin(request: Request) {
  return getCookie(request, "terrace_admin_session") === (process.env.ADMIN_SESSION_TOKEN || "terrace-admin-session")
}

function getCookie(request: Request, name: string) {
  const header = request.headers.get("cookie") || ""
  const match = header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : ""
}

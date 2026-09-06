import { randomUUID } from "crypto"
import { NextResponse } from "next/server"
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin"

const ADMIN_COOKIE = "terrace_admin"
const REVENUE_EMAIL = "site-revenue@terracefc.local"

export const dynamic = "force-dynamic"

type RevenueState = {
  adjustment: number
  entries: RevenueEntry[]
  updatedAt?: string
}

type RevenueEntry = {
  id: string
  amount: number
  reason: string
  createdAt: string
  kind: "manual"
}

export async function GET(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "Admin access is required." }, { status: 401 })
  }

  const state = await readRevenueState()
  return NextResponse.json({ revenue: state })
}

export async function POST(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "Admin access is required." }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const current = await readRevenueState()

  if (body?.reset === true) {
    const revenue = {
      adjustment: 0,
      entries: [] as RevenueEntry[],
      updatedAt: new Date().toISOString(),
    }
    const saved = await saveRevenueState(revenue)
    if (!saved) {
      return NextResponse.json({ error: "Revenue storage is not configured." }, { status: 500 })
    }
    return NextResponse.json({ revenue })
  }

  const removeEntryId = String(body?.removeEntryId || "").trim()
  if (removeEntryId) {
    const baseEntries = current.entries.length > 0
      ? current.entries
      : current.adjustment !== 0
        ? [createLegacyEntry(current.adjustment, current.updatedAt)]
        : []
    const entries = baseEntries.filter((entry) => entry.id !== removeEntryId)

    if (entries.length === baseEntries.length) {
      return NextResponse.json({ error: "Revenue entry not found." }, { status: 404 })
    }

    const revenue = {
      adjustment: entries.reduce((sum, item) => sum + item.amount, 0),
      entries,
      updatedAt: new Date().toISOString(),
    }

    const saved = await saveRevenueState(revenue)
    if (!saved) {
      return NextResponse.json({ error: "Revenue storage is not configured." }, { status: 500 })
    }

    return NextResponse.json({ revenue })
  }

  const delta = Number(body?.delta)

  if (!Number.isFinite(delta) || delta === 0) {
    return NextResponse.json({ error: "Enter an amount to add or subtract." }, { status: 400 })
  }

  const reason = body?.noReason === true ? "" : String(body?.reason || "").trim()
  if (!reason && body?.noReason !== true) {
    return NextResponse.json({ error: "Add a reason or choose No reason." }, { status: 400 })
  }

  const entry: RevenueEntry = {
    id: randomUUID(),
    amount: delta,
    reason,
    createdAt: new Date().toISOString(),
    kind: "manual",
  }

  const baseEntries = current.entries.length > 0
    ? current.entries
    : current.adjustment !== 0
      ? [createLegacyEntry(current.adjustment, current.updatedAt)]
      : []
  const entries = [entry, ...baseEntries].slice(0, 200)
  const adjustment = entries.reduce((sum, item) => sum + item.amount, 0)

  const revenue = {
    adjustment,
    entries,
    updatedAt: new Date().toISOString(),
  }

  const saved = await saveRevenueState(revenue)
  if (!saved) {
    return NextResponse.json({ error: "Revenue storage is not configured." }, { status: 500 })
  }

  return NextResponse.json({ revenue })
}

async function readRevenueState(): Promise<RevenueState> {
  if (!isSupabaseAdminConfigured || !supabaseAdmin) {
    return { adjustment: 0, entries: [] }
  }

  const user = await findRevenueUser()
  const value = user?.user_metadata?.revenue_state
  if (!value || typeof value !== "object") return { adjustment: 0, entries: [] }

  const adjustment = Number((value as RevenueState).adjustment)
  const entries = normalizeEntries((value as RevenueState).entries)
  const entryTotal = entries.reduce((sum, item) => sum + item.amount, 0)

  const updatedAt = typeof (value as RevenueState).updatedAt === "string" ? (value as RevenueState).updatedAt : undefined
  const legacyAdjustment = Number.isFinite(adjustment) ? adjustment : 0
  const normalizedEntries = entries.length > 0 ? entries : legacyAdjustment !== 0 ? [createLegacyEntry(legacyAdjustment, updatedAt)] : []

  return {
    adjustment: normalizedEntries.length > 0 ? normalizedEntries.reduce((sum, item) => sum + item.amount, 0) : legacyAdjustment,
    entries: normalizedEntries,
    updatedAt,
  }
}

async function saveRevenueState(revenue: RevenueState) {
  if (!isSupabaseAdminConfigured || !supabaseAdmin) {
    return false
  }

  const existingUser = await findRevenueUser()
  const metadata = { revenue_state: revenue }

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
    email: REVENUE_EMAIL,
    password: randomUUID(),
    email_confirm: true,
    user_metadata: metadata,
  })

  return !error
}

async function findRevenueUser() {
  if (!supabaseAdmin) return null

  const perPage = 1000
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
    if (error) return null

    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === REVENUE_EMAIL)
    if (user) return user
    if ((data.users || []).length < perPage) break
  }

  return null
}

function isAdmin(request: Request) {
  return getCookie(request, ADMIN_COOKIE) === (process.env.ADMIN_SESSION_TOKEN || "terrace-admin-session")
}

function getCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") || ""
  const match = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : ""
}

function normalizeEntries(value: unknown) {
  if (!Array.isArray(value)) return [] as RevenueEntry[]

  return value
    .map((entry): RevenueEntry | null => {
      if (!entry || typeof entry !== "object") return null
      const source = entry as Partial<RevenueEntry>
      const amount = Number(source.amount)
      if (!Number.isFinite(amount) || amount === 0) return null
      return {
        id: typeof source.id === "string" ? source.id : randomUUID(),
        amount,
        reason: typeof source.reason === "string" ? source.reason : "",
        createdAt: typeof source.createdAt === "string" ? source.createdAt : new Date().toISOString(),
        kind: "manual",
      }
    })
    .filter((entry): entry is RevenueEntry => Boolean(entry))
}

function createLegacyEntry(amount: number, updatedAt?: string): RevenueEntry {
  return {
    id: "previous-manual-balance",
    amount,
    reason: "Previous manual balance",
    createdAt: updatedAt || new Date().toISOString(),
    kind: "manual",
  }
}

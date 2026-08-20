import { randomUUID } from "crypto"
import { NextResponse } from "next/server"
import { kits } from "@/lib/data"
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin"
import { readSiteSettings } from "@/lib/site-settings"

const ANALYTICS_EMAIL = "site-analytics@terracefc.local"
const ACTIVE_WINDOW_MS = 90 * 1000
const VERCEL_ANALYTICS_PROJECT_ID = process.env.VERCEL_ANALYTICS_PROJECT_ID || process.env.VERCEL_PROJECT_ID || "prj_VWZCmLH2pAxiyveWAJwXRQrnZXAo"
const VERCEL_ANALYTICS_TEAM_ID = process.env.VERCEL_ANALYTICS_TEAM_ID || process.env.VERCEL_TEAM_ID || process.env.VERCEL_ORG_ID || "team_yE4jZvYpO1gmOF9tQhAgUFus"

type AnalyticsState = {
  totalOpens: number
  monthOpens: Record<string, number>
  yearOpens: Record<string, number>
  openEvents: string[]
  sessions: Record<string, { lastSeen: string; openedAt: string; path?: string; title?: string; activity?: string; jersey?: string; cartItems?: AnalyticsCartItem[] }>
  daily: Record<string, AnalyticsDailyStats>
  updatedAt?: string
}

type AnalyticsCartItem = {
  id?: number
  name: string
  club?: string
  season?: string
  quantity: number
  size?: string
}

type AnalyticsDailyStats = {
  opens: number
  jerseyViews: Record<string, number>
  cartItems: Record<string, number>
  activityEvents: Array<{ at: string; type: string; label: string }>
}

type VercelAnalyticsSnapshot = {
  totalOpens: number
  monthOpens: number
  yearOpens: number
  todayOpens: number
  openEvents: string[]
  todayTopJerseys: Array<{ label: string; count: number }>
  topJerseys: Array<{ label: string; count: number }>
}

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (await shouldIgnoreRequest(request)) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  const visitorId = sanitizeVisitorId(body?.visitorId)
  const event = body?.event === "open" ? "open" : "heartbeat"
  const path = sanitizeText(body?.path, 180)
  const title = sanitizeText(body?.title, 160)
  const jersey = sanitizeText(body?.jersey, 160)
  const activity = sanitizeText(body?.activity, 180) || describeActivity(path, jersey)
  const cartItems = normalizeCartItems(body?.cartItems)
  const now = new Date()
  const day = now.toISOString().slice(0, 10)
  const current = await readAnalyticsState()
  const daily = { ...current.daily }
  const today = normalizeDailyStats(daily[day])
  const sessions = pruneSessions({
    ...current.sessions,
    [visitorId]: {
      openedAt: current.sessions[visitorId]?.openedAt || now.toISOString(),
      lastSeen: now.toISOString(),
      path,
      title,
      activity,
      jersey,
      cartItems,
    },
  }, now)

  const state: AnalyticsState = {
    ...current,
    sessions,
    daily,
    updatedAt: now.toISOString(),
  }

  if (event === "open") {
    const month = now.toISOString().slice(0, 7)
    const year = now.toISOString().slice(0, 4)
    state.totalOpens += 1
    state.monthOpens = { ...state.monthOpens, [month]: (state.monthOpens[month] || 0) + 1 }
    state.yearOpens = { ...state.yearOpens, [year]: (state.yearOpens[year] || 0) + 1 }
    state.openEvents = pruneOpenEvents([...(state.openEvents || []), now.toISOString()], now)
    today.opens += 1
  }

  if (jersey) {
    today.jerseyViews[jersey] = (today.jerseyViews[jersey] || 0) + 1
  }

  for (const item of cartItems) {
    const key = formatCartItemLabel(item)
    today.cartItems[key] = Math.max(today.cartItems[key] || 0, item.quantity)
  }

  if (activity) {
    today.activityEvents = [
      ...today.activityEvents,
      { at: now.toISOString(), type: event, label: activity },
    ].slice(-150)
  }
  state.daily[day] = today

  await saveAnalyticsState(state)

  return NextResponse.json({ ok: true })
}

export async function GET() {
  const now = new Date()
  const state = await readAnalyticsState()
  const sessions = pruneSessions(state.sessions, now)
  const month = now.toISOString().slice(0, 7)
  const year = now.toISOString().slice(0, 4)
  const day = now.toISOString().slice(0, 10)
  const today = normalizeDailyStats(state.daily[day])
  const allTime = buildAllTimeStats(state.daily)
  const vercel = await readVercelAnalytics(now)

  return NextResponse.json({
    analytics: {
      totalOpens: vercel?.totalOpens ?? state.totalOpens,
      monthOpens: vercel?.monthOpens ?? (state.monthOpens[month] || 0),
      yearOpens: vercel?.yearOpens ?? (state.yearOpens[year] || 0),
      openEvents: vercel?.openEvents ?? pruneOpenEvents(state.openEvents || [], now),
      opensSource: vercel ? "vercel" : "local",
      activeVisitors: Object.keys(sessions).length,
      activeSessions: Object.entries(sessions).map(([id, session]) => ({
        id,
        path: session.path || "",
        title: session.title || "",
        activity: session.activity || "",
        jersey: session.jersey || "",
        cartItems: session.cartItems || [],
        lastSeen: session.lastSeen,
      })),
      today: {
        opens: vercel?.todayOpens ?? today.opens,
        topJerseys: vercel?.todayTopJerseys ?? topEntries(today.jerseyViews),
        cartItems: topEntries(today.cartItems),
        recentActivity: today.activityEvents.slice(-20).reverse(),
      },
      allTime: {
        topJerseys: vercel?.topJerseys ?? topEntries(allTime.jerseyViews).slice(0, 25),
        cartItems: topEntries(allTime.cartItems).slice(0, 25),
      },
      updatedAt: state.updatedAt,
    },
  })
}

async function shouldIgnoreRequest(request: Request) {
  const cookie = request.headers.get("cookie") || ""
  const adminToken = process.env.ADMIN_SESSION_TOKEN || "terrace-admin-session"
  if (cookie.includes(`terrace_admin=${adminToken}`)) return true

  const settings = await readSiteSettings()
  const ip = getClientIp(request)
  return Boolean(ip && settings.allowedIp && ip === settings.allowedIp)
}

function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for") || ""
  return forwarded.split(",")[0]?.trim() || request.headers.get("x-real-ip") || ""
}

async function readAnalyticsState(): Promise<AnalyticsState> {
  if (!isSupabaseAdminConfigured || !supabaseAdmin) {
    return defaultAnalyticsState()
  }

  const user = await findAnalyticsUser()
  const value = user?.user_metadata?.analytics_state
  if (!value || typeof value !== "object") return defaultAnalyticsState()

  const source = value as Partial<AnalyticsState>
  return {
    totalOpens: Number.isFinite(Number(source.totalOpens)) ? Number(source.totalOpens) : 0,
    monthOpens: isRecord(source.monthOpens) ? source.monthOpens as Record<string, number> : {},
    yearOpens: isRecord(source.yearOpens) ? source.yearOpens as Record<string, number> : {},
    openEvents: Array.isArray(source.openEvents) ? source.openEvents.filter((value) => typeof value === "string") : [],
    sessions: isRecord(source.sessions) ? source.sessions as AnalyticsState["sessions"] : {},
    daily: isRecord(source.daily) ? source.daily as Record<string, AnalyticsDailyStats> : {},
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : undefined,
  }
}

async function saveAnalyticsState(state: AnalyticsState) {
  if (!isSupabaseAdminConfigured || !supabaseAdmin) return false

  const existingUser = await findAnalyticsUser()
  const metadata = { analytics_state: state }

  if (existingUser) {
    const previousState = existingUser.user_metadata?.analytics_state
    const previousBackups = Array.isArray(existingUser.user_metadata?.analytics_state_backups)
      ? existingUser.user_metadata.analytics_state_backups
      : []
    const { error } = await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
      user_metadata: {
        ...existingUser.user_metadata,
        analytics_state_backups: previousState
          ? [...previousBackups, { savedAt: new Date().toISOString(), state: previousState }].slice(-25)
          : previousBackups,
        ...metadata,
      },
    })
    return !error
  }

  const { error } = await supabaseAdmin.auth.admin.createUser({
    email: ANALYTICS_EMAIL,
    password: randomUUID(),
    email_confirm: true,
    user_metadata: metadata,
  })

  return !error
}

async function findAnalyticsUser() {
  if (!supabaseAdmin) return null

  const perPage = 1000
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
    if (error) return null
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === ANALYTICS_EMAIL)
    if (user) return user
    if ((data.users || []).length < perPage) break
  }
  return null
}

function defaultAnalyticsState(): AnalyticsState {
  return {
    totalOpens: 0,
    monthOpens: {},
    yearOpens: {},
    openEvents: [],
    sessions: {},
    daily: {},
  }
}

function pruneOpenEvents(events: string[], now: Date) {
  const ninetyDaysAgo = now.getTime() - 90 * 24 * 60 * 60 * 1000
  return events
    .filter((event) => {
      const time = new Date(event).getTime()
      return Number.isFinite(time) && time >= ninetyDaysAgo
    })
    .slice(-5000)
}

function pruneSessions(sessions: AnalyticsState["sessions"], now: Date) {
  return Object.fromEntries(
    Object.entries(sessions).filter(([, session]) => {
      const lastSeen = new Date(session.lastSeen).getTime()
      return Number.isFinite(lastSeen) && now.getTime() - lastSeen <= ACTIVE_WINDOW_MS
    }),
  )
}

function sanitizeVisitorId(value: unknown) {
  const text = typeof value === "string" ? value : ""
  return text.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || randomUUID()
}

function sanitizeText(value: unknown, maxLength: number) {
  return (typeof value === "string" ? value : "").replace(/[<>]/g, "").slice(0, maxLength)
}

function isRecord(value: unknown) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function normalizeCartItems(value: unknown): AnalyticsCartItem[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 12).map((item) => {
    const source = item && typeof item === "object" ? item as Record<string, unknown> : {}
    return {
      id: Number.isFinite(Number(source.id)) ? Number(source.id) : undefined,
      name: sanitizeText(source.name, 100) || "Jersey",
      club: sanitizeText(source.club, 80),
      season: sanitizeText(source.season, 80),
      quantity: Math.max(1, Math.min(99, Math.floor(Number(source.quantity) || 1))),
      size: sanitizeText(source.size, 12),
    }
  })
}

function normalizeDailyStats(value: unknown): AnalyticsDailyStats {
  const source = value && typeof value === "object" ? value as Partial<AnalyticsDailyStats> : {}
  return {
    opens: Number.isFinite(Number(source.opens)) ? Number(source.opens) : 0,
    jerseyViews: isRecord(source.jerseyViews) ? source.jerseyViews as Record<string, number> : {},
    cartItems: isRecord(source.cartItems) ? source.cartItems as Record<string, number> : {},
    activityEvents: Array.isArray(source.activityEvents)
      ? source.activityEvents.filter((event): event is { at: string; type: string; label: string } => Boolean(event && typeof event.at === "string" && typeof event.label === "string")).slice(-150)
      : [],
  }
}

function topEntries(value: Record<string, number>) {
  return Object.entries(value)
    .map(([label, count]) => ({ label, count: Number(count) || 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
}

function buildAllTimeStats(daily: Record<string, AnalyticsDailyStats>) {
  const jerseyViews: Record<string, number> = {}
  const cartItems: Record<string, number> = {}

  for (const value of Object.values(daily || {})) {
    const stats = normalizeDailyStats(value)
    for (const [label, count] of Object.entries(stats.jerseyViews)) {
      jerseyViews[label] = (jerseyViews[label] || 0) + (Number(count) || 0)
    }
    for (const [label, count] of Object.entries(stats.cartItems)) {
      cartItems[label] = (cartItems[label] || 0) + (Number(count) || 0)
    }
  }

  return { jerseyViews, cartItems }
}

async function readVercelAnalytics(now: Date): Promise<VercelAnalyticsSnapshot | null> {
  const token = process.env.VERCEL_ANALYTICS_TOKEN || process.env.VERCEL_TOKEN
  if (!token || !VERCEL_ANALYTICS_PROJECT_ID) return null

  try {
    const tomorrow = formatDateOnly(addDays(now, 1))
    const today = formatDateOnly(now)
    const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`
    const year = `${now.getUTCFullYear()}-01-01`
    const ninetyDaysAgo = formatDateOnly(addDays(now, -90))
    const yesterdayIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

    const [total, monthCount, yearCount, todayCount, todayPaths, allPaths] = await Promise.all([
      queryVercelWebAnalytics("visits/count", {}, token),
      queryVercelWebAnalytics("visits/count", { since: month, until: tomorrow }, token),
      queryVercelWebAnalytics("visits/count", { since: year, until: tomorrow }, token),
      queryVercelWebAnalytics("visits/count", { since: today, until: tomorrow }, token),
      queryVercelWebAnalytics("visits/aggregate", { since: today, until: tomorrow, by: "requestPath", limit: "100" }, token),
      queryVercelWebAnalytics("visits/aggregate", { since: ninetyDaysAgo, until: tomorrow, by: "requestPath", limit: "200" }, token),
    ])

    let openEvents: string[] = []
    try {
      const hourly = await queryVercelWebAnalytics("visits/aggregate", { since: yesterdayIso, until: now.toISOString(), by: "hour", limit: "48" }, token)
      openEvents = buildOpenEventsFromVercelRows(getVercelRows(hourly), now)
    } catch {
      openEvents = []
    }

    return {
      totalOpens: getVercelCount(total),
      monthOpens: getVercelCount(monthCount),
      yearOpens: getVercelCount(yearCount),
      todayOpens: getVercelCount(todayCount),
      openEvents,
      todayTopJerseys: buildTopJerseysFromVercelRows(getVercelRows(todayPaths)).slice(0, 10),
      topJerseys: buildTopJerseysFromVercelRows(getVercelRows(allPaths)).slice(0, 25),
    }
  } catch {
    return null
  }
}

async function queryVercelWebAnalytics(endpoint: "visits/count" | "visits/aggregate", params: Record<string, string>, token: string) {
  const url = new URL(`https://api.vercel.com/v1/query/web-analytics/${endpoint}`)
  url.searchParams.set("projectId", VERCEL_ANALYTICS_PROJECT_ID)
  if (VERCEL_ANALYTICS_TEAM_ID) url.searchParams.set("teamId", VERCEL_ANALYTICS_TEAM_ID)
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value)
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(`Vercel analytics request failed: ${response.status}`)
  }
  return data
}

function getVercelCount(value: unknown) {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {}
  const data = source.data && typeof source.data === "object" ? source.data as Record<string, unknown> : {}
  return Math.max(0, Math.floor(Number(data.pageviews ?? data.visits ?? data.count ?? source.pageviews ?? source.count ?? 0) || 0))
}

function getVercelRows(value: unknown): Array<Record<string, unknown>> {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {}
  const data = source.data
  if (Array.isArray(data)) return data.filter(isRecord) as Array<Record<string, unknown>>
  if (data && typeof data === "object") {
    const rows = (data as Record<string, unknown>).rows
    if (Array.isArray(rows)) return rows.filter(isRecord) as Array<Record<string, unknown>>
  }
  const rows = source.rows
  return Array.isArray(rows) ? rows.filter(isRecord) as Array<Record<string, unknown>> : []
}

function buildOpenEventsFromVercelRows(rows: Array<Record<string, unknown>>, now: Date) {
  const events: string[] = []
  for (const row of rows) {
    const count = Math.max(0, Math.floor(Number(row.pageviews ?? row.visits ?? row.count ?? 0) || 0))
    const timestamp = getVercelRowTimestamp(row) || now.toISOString()
    for (let index = 0; index < Math.min(count, 250); index += 1) {
      events.push(timestamp)
    }
  }
  return pruneOpenEvents(events, now)
}

function getVercelRowTimestamp(row: Record<string, unknown>) {
  for (const key of ["timestamp", "date", "hour", "time", "bucket"]) {
    const value = row[key]
    if (typeof value === "string" && value.trim()) {
      const parsed = new Date(value)
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00:00.000Z`
    }
  }
  return ""
}

function buildTopJerseysFromVercelRows(rows: Array<Record<string, unknown>>) {
  const totals: Record<string, number> = {}
  for (const row of rows) {
    const path = String(row.requestPath ?? row.route ?? row.path ?? row.page ?? "")
    const match = path.match(/^\/kit\/(\d+)/)
    if (!match) continue

    const kit = kits.find((item) => item.id === Number(match[1]))
    const label = kit ? [kit.name, kit.club, kit.season].filter(Boolean).join(" - ") : `Jersey ${match[1]}`
    const count = Math.max(0, Math.floor(Number(row.pageviews ?? row.visits ?? row.count ?? 0) || 0))
    totals[label] = (totals[label] || 0) + count
  }
  return topEntries(totals)
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
}

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10)
}

function formatCartItemLabel(item: AnalyticsCartItem) {
  return [item.name, item.club, item.season, item.size ? `Size ${item.size}` : ""].filter(Boolean).join(" - ")
}

function describeActivity(path: string, jersey: string) {
  if (jersey) return `Viewing ${jersey}`
  if (path === "/checkout") return "Checking out"
  if (path === "/collection") return "Browsing collection"
  if (path === "/support") return "Using support"
  if (path === "/request-jersey") return "Requesting a jersey"
  if (path === "/") return "On homepage"
  return path ? `Viewing ${path}` : ""
}

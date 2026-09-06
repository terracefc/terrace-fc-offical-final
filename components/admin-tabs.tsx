"use client"

import { useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import { ClipboardList, IndianRupee, Loader2, MessageCircle, Settings, ShieldAlert, Shirt, Ticket, TrendingUp, UsersRound } from "lucide-react"
import { AdminAccounts } from "@/components/admin-accounts"
import { AdminOrders } from "@/components/admin-orders"
import { AdminCoupons } from "@/components/admin-coupons"
import { AdminLockdown } from "@/components/admin-lockdown"
import { AdminTestMode } from "@/components/admin-test-mode"
import { AdminSupport } from "@/components/admin-support"
import { AdminJerseyRequests } from "@/components/admin-jersey-requests"
import type { Kit } from "@/lib/data"
import { fetchOrders, isCancelledOrderExpired, type StoreOrder } from "@/lib/orders"
import { defaultSiteSettings, type SiteSettings } from "@/lib/site-settings"

export type AdminTab = "orders" | "support" | "requests" | "accounts" | "coupons" | "lockdown" | "settings"

export function AdminTabs({ kits, initialTab = "orders" }: { kits: Kit[]; initialTab?: AdminTab }) {
  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab)
  const [orders, setOrders] = useState<StoreOrder[]>([])
  const [now, setNow] = useState(Date.now())
  const [analytics, setAnalytics] = useState({
    totalOpens: 0,
    monthOpens: 0,
    yearOpens: 0,
    openEvents: [] as string[],
    opensSource: "local" as "local" | "vercel",
    activeVisitors: 0,
    activeSessions: [] as Array<{ id: string; path: string; title: string; activity?: string; jersey?: string; cartItems?: Array<{ name: string; club?: string; season?: string; quantity: number; size?: string }>; lastSeen: string }>,
    today: {
      opens: 0,
      topJerseys: [] as Array<{ label: string; count: number }>,
      cartItems: [] as Array<{ label: string; count: number }>,
      recentActivity: [] as Array<{ at: string; type: string; label: string }>,
    },
    allTime: {
      topJerseys: [] as Array<{ label: string; count: number }>,
      cartItems: [] as Array<{ label: string; count: number }>,
    },
  })

  useEffect(() => {
    const syncOrders = () => fetchOrders().then(setOrders).catch(() => null)
    syncOrders()
    const interval = window.setInterval(syncOrders, 10000)
    window.addEventListener("focus", syncOrders)
    window.addEventListener("storage", syncOrders)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener("focus", syncOrders)
      window.removeEventListener("storage", syncOrders)
    }
  }, [])

  useEffect(() => {
    const syncAnalytics = () => {
      fetch("/api/analytics", { cache: "no-store", credentials: "same-origin" })
        .then((response) => response.json())
        .then((data) => {
          if (data?.analytics) setAnalytics(data.analytics)
        })
        .catch(() => null)
    }

    syncAnalytics()
    const interval = window.setInterval(syncAnalytics, 5000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab])

  const visibleOrders = useMemo(() => orders.filter((order) => !isCancelledOrderExpired(order, now)), [orders, now])
  const openGraph = useMemo(() => buildOpenGraph(analytics.openEvents), [analytics.openEvents])
  const liveSessions = analytics.activeSessions.map((session) => ({
    ...session,
    jerseyName: session.jersey || getJerseyNameFromPath(session.path, kits) || cleanPageTitle(session.title),
    activity: session.activity || (session.path.startsWith("/kit/") ? `Viewing ${getJerseyNameFromPath(session.path, kits) || "a jersey"}` : getPageActivity(session.path)),
  }))

  return (
    <section className="flex flex-col gap-6">
      {activeTab === "orders" && <MaintenanceModeSwitch />}

      <div className="grid gap-3 sm:grid-cols-4">
        <DashboardStat icon={<ClipboardList className="h-4 w-4" />} label="Total Orders" value={visibleOrders.length.toString()} />
        <DashboardStat icon={<IndianRupee className="h-4 w-4" />} label="Paid/COD Orders" value={visibleOrders.filter((order) => order.status === "paid" || order.status === "cod").length.toString()} />
        <DashboardStat icon={<UsersRound className="h-4 w-4" />} label="Opens" value={analytics.totalOpens.toString()} />
        <DashboardStat icon={<UsersRound className="h-4 w-4" />} label="Live Now" value={analytics.activeVisitors.toString()} />
      </div>
      <div className="rounded-2xl border border-border bg-background/85 p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Opens By Time - {analytics.opensSource === "vercel" ? "Vercel" : "Local"}
            </p>
            <h2 className="text-lg font-black tracking-tight">Last 24 Hours</h2>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <TrendingUp className="h-4 w-4" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <svg viewBox="0 0 720 220" className="h-56 w-full text-accent" role="img" aria-label="Opens line graph for the last 24 hours">
              <defs>
                <linearGradient id="opensLineFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              {[0, 1, 2, 3].map((line) => (
                <line
                  key={line}
                  x1="42"
                  x2="700"
                  y1={28 + line * 42}
                  y2={28 + line * 42}
                  className="stroke-border"
                  strokeWidth="1"
                />
              ))}
              <path d={openGraph.areaPath} fill="url(#opensLineFill)" />
              <path d={openGraph.linePath} className="stroke-accent" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              {openGraph.points.map((point, index) => (
                <g key={point.key}>
                  <circle cx={point.x} cy={point.y} r="4.5" className="fill-background stroke-accent" strokeWidth="3">
                    <title>{`${point.count} open${point.count === 1 ? "" : "s"} at ${point.label}`}</title>
                  </circle>
                  {(index % 3 === 0 || index === openGraph.points.length - 1) && (
                    <text x={point.x} y="198" textAnchor="middle" className="fill-muted-foreground text-[10px] font-black">
                      {point.shortLabel}
                    </text>
                  )}
                  {point.count > 0 && (
                    <text x={point.x} y={Math.max(14, point.y - 10)} textAnchor="middle" className="fill-foreground text-[10px] font-black">
                      {point.count}
                    </text>
                  )}
                </g>
              ))}
              <text x="14" y="34" className="fill-muted-foreground text-[10px] font-black">{openGraph.maxCount}</text>
              <text x="22" y="160" className="fill-muted-foreground text-[10px] font-black">0</text>
            </svg>
          </div>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-2xl border border-border bg-background/85 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Live Activity</p>
              <h2 className="text-lg font-black tracking-tight">What Visitors Are Doing</h2>
            </div>
            <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-black text-accent">{analytics.activeVisitors} live</span>
          </div>
          {liveSessions.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No live visitors right now.</p>
          ) : (
            <div className="space-y-3">
              {liveSessions.map((session) => (
                <div key={session.id} className="rounded-xl border border-border bg-secondary/20 p-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-black">{session.activity}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{timeAgo(session.lastSeen)}</p>
                  </div>
                  {session.jerseyName && <p className="mt-1 text-xs text-accent">Jersey: <span className="font-black">{session.jerseyName}</span></p>}
                  {session.cartItems?.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {session.cartItems.map((item, index) => (
                        <span key={`${item.name}-${index}`} className="rounded-full bg-background px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                          Cart: {item.name} x{item.quantity}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-background/85 p-4 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Today Overview</p>
          <h2 className="mt-1 text-lg font-black tracking-tight">{analytics.today.opens} opens today</h2>
          <SummaryList title="Most Viewed Jerseys" items={analytics.today.topJerseys} empty="No jersey views today." />
          <SummaryList title="Kept In Cart" items={analytics.today.cartItems} empty="No cart items tracked today." />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-background/85 p-4 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">All-Time Product Opens</p>
          <h2 className="mt-1 text-lg font-black tracking-tight">Most Opened Jerseys</h2>
          <DataTable items={analytics.allTime.topJerseys} empty="No saved jersey-open history yet." countLabel="opens" />
        </div>
        <div className="rounded-2xl border border-border bg-background/85 p-4 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">All-Time Cart Interest</p>
          <h2 className="mt-1 text-lg font-black tracking-tight">Products Kept In Cart</h2>
          <DataTable items={analytics.allTime.cartItems} empty="No saved cart history yet." countLabel="cart qty" />
        </div>
      </div>

      <AdminTabBar activeTab={activeTab} setActiveTab={setActiveTab} />

      {activeTab === "orders" && <AdminOrders />}
      {activeTab === "support" && <AdminSupport />}
      {activeTab === "requests" && <AdminJerseyRequests />}
      {activeTab === "accounts" && <AdminAccounts />}
      {activeTab === "coupons" && <AdminCoupons />}
      {activeTab === "lockdown" && (
        <div className="space-y-6">
          <AdminLockdown />
          <AdminTestMode kits={kits} />
        </div>
      )}
      {activeTab === "settings" && (
        <div className="max-w-3xl border border-border rounded-2xl bg-foreground text-background p-5 shadow-sm">
          <h2 className="font-black text-xl tracking-tight mb-2">Admin Password</h2>
          <p className="text-sm text-background/70">
            Default password is <span className="font-black text-background">Vishrut@2026</span>. For a real deployment, set
            <span className="font-black text-background"> ADMIN_PASSWORD</span> and
            <span className="font-black text-background"> ADMIN_SESSION_TOKEN</span> in your environment.
          </p>
        </div>
      )}
    </section>
  )
}

function MaintenanceModeSwitch() {
  const [settings, setSettings] = useState<SiteSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    fetch("/api/admin/settings", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Could not load maintenance mode.")))
      .then((data) => setSettings(data.settings))
      .catch((error) => setMessage(error instanceof Error ? error.message : "Could not load maintenance mode."))
      .finally(() => setIsLoading(false))
  }, [])

  const toggleMaintenance = async (enabled: boolean) => {
    if (!settings) return
    const previous = settings
    const next = { ...settings, lockdownEnabled: enabled }
    setSettings(next)
    setIsSaving(true)
    setMessage("")

    try {
      const response = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: next }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || "Could not update maintenance mode.")
      setSettings(data.settings)
      setMessage(enabled ? "Maintenance mode is on for every visitor." : "The store is live for everyone.")
    } catch (error) {
      setSettings(previous)
      setMessage(error instanceof Error ? error.message : "Could not update maintenance mode.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-background/85 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-black">Maintenance Mode</p>
            {!isLoading && settings && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${settings.lockdownEnabled ? "bg-accent/15 text-accent" : "bg-secondary text-muted-foreground"}`}>
                {settings.lockdownEnabled ? "On" : "Off"}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {isLoading ? "Checking the saved setting..." : settings?.lockdownEnabled ? "Every storefront page is showing the maintenance screen." : "The storefront is open normally."}
          </p>
        </div>
        {isLoading || !settings ? (
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <label className="relative inline-flex shrink-0 cursor-pointer items-center">
            <input
              type="checkbox"
              checked={settings.lockdownEnabled}
              disabled={isSaving}
              onChange={(event) => toggleMaintenance(event.target.checked)}
              className="peer sr-only"
              aria-label="Maintenance Mode"
            />
            <span className="h-7 w-12 rounded-full bg-muted transition-colors peer-checked:bg-accent peer-disabled:opacity-50" />
            <span className="absolute left-1 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
            {isSaving && <Loader2 className="absolute -left-7 h-4 w-4 animate-spin text-muted-foreground" />}
          </label>
        )}
      </div>
      {message && <p className="mt-3 text-xs font-bold text-accent">{message}</p>}
    </div>
  )
}

function TabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-11 min-w-[130px] items-center justify-center gap-2 rounded-lg px-4 text-xs font-black uppercase tracking-widest transition-colors ${
        active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function AdminTabBar({
  activeTab,
  setActiveTab,
}: {
  activeTab: AdminTab
  setActiveTab: (tab: AdminTab) => void
}) {
  return (
    <div className="w-full overflow-x-auto rounded-xl border border-border bg-background p-1">
      <div className="grid min-w-max grid-cols-7 gap-1">
      <TabButton active={activeTab === "orders"} icon={<ClipboardList className="w-4 h-4" />} label="Orders" onClick={() => setActiveTab("orders")} />
      <TabButton active={activeTab === "support"} icon={<MessageCircle className="w-4 h-4" />} label="Support" onClick={() => setActiveTab("support")} />
      <TabButton active={activeTab === "requests"} icon={<Shirt className="w-4 h-4" />} label="Requests" onClick={() => setActiveTab("requests")} />
      <TabButton active={activeTab === "accounts"} icon={<UsersRound className="w-4 h-4" />} label="Accounts" onClick={() => setActiveTab("accounts")} />
      <TabButton active={activeTab === "coupons"} icon={<Ticket className="w-4 h-4" />} label="Coupons" onClick={() => setActiveTab("coupons")} />
      <TabButton active={activeTab === "lockdown"} icon={<ShieldAlert className="w-4 h-4" />} label="Test Mode" onClick={() => setActiveTab("lockdown")} />
      <TabButton active={activeTab === "settings"} icon={<Settings className="w-4 h-4" />} label="Settings" onClick={() => setActiveTab("settings")} />
      </div>
    </div>
  )
}

function DashboardStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background/85 p-4 shadow-sm">
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">{icon}</div>
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-black tracking-tight">{value}</p>
    </div>
  )
}

function SummaryList({ title, items, empty }: { title: string; items: Array<{ label: string; count: number }>; empty: string }) {
  return (
    <div className="mt-4">
      <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">{title}</p>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">{empty}</p>
      ) : (
        <div className="space-y-2">
          {items.slice(0, 5).map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/20 p-3 text-xs">
              <span className="min-w-0 truncate font-black">{item.label}</span>
              <span className="shrink-0 rounded-full bg-accent/10 px-2 py-1 font-black text-accent">{item.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DataTable({ items, empty, countLabel }: { items: Array<{ label: string; count: number }>; empty: string; countLabel: string }) {
  if (items.length === 0) {
    return <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">{empty}</p>
  }

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-border">
      <table className="w-full text-left text-xs">
        <thead className="bg-secondary/40 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Jersey / Product</th>
            <th className="w-24 px-3 py-2 text-right">{countLabel}</th>
          </tr>
        </thead>
        <tbody>
          {items.slice(0, 12).map((item, index) => (
            <tr key={item.label} className="border-t border-border">
              <td className="min-w-0 px-3 py-2">
                <span className="mr-2 text-muted-foreground">#{index + 1}</span>
                <span className="font-black">{item.label}</span>
              </td>
              <td className="px-3 py-2 text-right font-black text-accent">{item.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function timeAgo(value: string) {
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return "just now"
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000))
  if (seconds < 10) return "now"
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.floor(minutes / 60)}h ago`
}

function getPageActivity(path: string) {
  if (path === "/checkout") return "Checking out"
  if (path === "/collection") return "Browsing collection"
  if (path === "/support") return "Using support"
  if (path === "/request-jersey") return "Requesting a jersey"
  if (path === "/") return "On homepage"
  return path ? `Viewing ${path}` : "On the site"
}

function buildOpenGraph(events: string[]) {
  const now = new Date()
  const hours = Array.from({ length: 24 }, (_, index) => {
    const date = new Date(now)
    date.setMinutes(0, 0, 0)
    date.setHours(date.getHours() - (23 - index))
    return date
  })
  const counts = hours.map((date) => {
    const nextHour = new Date(date)
    nextHour.setHours(nextHour.getHours() + 1)
    const count = events.filter((event) => {
      const time = new Date(event).getTime()
      return Number.isFinite(time) && time >= date.getTime() && time < nextHour.getTime()
    }).length
    return {
      key: date.toISOString(),
      count,
      label: date.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", hour12: true }),
      shortLabel: date.toLocaleString("en-IN", { hour: "numeric", hour12: true }).replace(" ", ""),
    }
  })
  const maxCount = Math.max(1, ...counts.map((point) => point.count))
  const chart = { left: 42, right: 700, top: 22, bottom: 160 }
  const width = chart.right - chart.left
  const height = chart.bottom - chart.top
  const points = counts.map((point, index) => {
    const x = chart.left + (width / Math.max(1, counts.length - 1)) * index
    const y = chart.bottom - (point.count / maxCount) * height
    return { ...point, x, y }
  })
  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ")
  const areaPath = `${linePath} L ${chart.right} ${chart.bottom} L ${chart.left} ${chart.bottom} Z`
  return { points, linePath, areaPath, maxCount }
}

function getJerseyNameFromPath(path: string, kits: Kit[]) {
  const match = path.match(/\/kit\/(\d+)/)
  const id = match ? Number(match[1]) : NaN
  const kit = kits.find((item) => item.id === id)
  if (!kit) return ""
  return `${kit.name} ${kit.club} ${kit.season}`.trim()
}

function cleanPageTitle(title: string) {
  return title.replace(/\s*\|\s*terrace\.fc/i, "").replace(/^kit\s+\d+\s*/i, "").trim()
}

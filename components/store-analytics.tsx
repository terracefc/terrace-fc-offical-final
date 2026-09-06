"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { kits } from "@/lib/data"
import { useStore } from "@/lib/store-context"

const VISITOR_KEY = "terrace_visitor_id"
const OPEN_KEY = "terrace_open_tracked"

export function StoreAnalytics() {
  const pathname = usePathname()
  const { cart } = useStore()

  useEffect(() => {
    if (pathname?.startsWith("/admin")) return

    const visitorId = getVisitorId()
    const openKey = `${OPEN_KEY}:${new Date().toISOString().slice(0, 10)}`
    const shouldTrackOpen = window.sessionStorage.getItem(openKey) !== "true"

    if (shouldTrackOpen) {
      window.sessionStorage.setItem(openKey, "true")
      sendAnalytics("open", visitorId, cart)
    } else {
      sendAnalytics("heartbeat", visitorId, cart)
    }

    const interval = window.setInterval(() => sendAnalytics("heartbeat", visitorId, cart), 30000)
    const onVisibility = () => {
      if (document.visibilityState === "visible") sendAnalytics("heartbeat", visitorId, cart)
    }
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [pathname, cart])

  return null
}

function getVisitorId() {
  try {
    const existing = window.localStorage.getItem(VISITOR_KEY)
    if (existing) return existing
    const next = crypto.randomUUID()
    window.localStorage.setItem(VISITOR_KEY, next)
    return next
  } catch {
    return Math.random().toString(36).slice(2)
  }
}

function sendAnalytics(event: "open" | "heartbeat", visitorId: string, cart: ReturnType<typeof useStore>["cart"]) {
  const jersey = getCurrentJerseyName(window.location.pathname)
  const cartItems = cart.map((item) => ({
    id: item.kit.id,
    name: item.kit.name,
    club: item.kit.club,
    season: item.kit.season,
    quantity: item.quantity,
    size: item.size,
  }))

  fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event,
      visitorId,
      path: window.location.pathname,
      title: document.title,
      jersey,
      activity: getActivityLabel(window.location.pathname, jersey, cartItems.length),
      cartItems,
    }),
    keepalive: true,
  }).catch(() => null)
}

function getCurrentJerseyName(pathname: string) {
  const match = pathname.match(/^\/kit\/(\d+)/)
  if (!match) return ""
  const kit = kits.find((item) => item.id === Number(match[1]))
  if (!kit) return `Jersey ${match[1]}`
  return [kit.name, kit.club, kit.season].filter(Boolean).join(" ")
}

function getActivityLabel(pathname: string, jersey: string, cartCount: number) {
  const suffix = cartCount > 0 ? ` with ${cartCount} cart item${cartCount === 1 ? "" : "s"}` : ""
  if (jersey) return `Viewing ${jersey}${suffix}`
  if (pathname === "/checkout") return `Checking out${suffix}`
  if (pathname === "/collection") return `Browsing collection${suffix}`
  if (pathname === "/support") return "Using support"
  if (pathname === "/request-jersey") return "Requesting a jersey"
  if (pathname === "/") return `On homepage${suffix}`
  return `Viewing ${pathname}${suffix}`
}

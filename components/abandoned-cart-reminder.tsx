"use client"

import { useEffect, useMemo } from "react"
import { readCustomer } from "@/lib/customer-auth"
import { getCartItemUnitPrice, getJerseyBackLabel, getJerseyVersionLabel, useStore } from "@/lib/store-context"

const CART_SIGNATURE_KEY = "terrace_cart_reminder_signature"
const CART_CHANGED_AT_KEY = "terrace_cart_reminder_changed_at"
const CART_SENT_PREFIX = "terrace_cart_reminder_sent:"
const REMINDER_DELAY_MS = 30 * 60 * 1000
const RESEND_AFTER_MS = 24 * 60 * 60 * 1000

export function AbandonedCartReminder() {
  const { cart } = useStore()
  const signature = useMemo(() => createCartSignature(cart), [cart])

  useEffect(() => {
    if (!signature || cart.length === 0) {
      window.localStorage.removeItem(CART_SIGNATURE_KEY)
      window.localStorage.removeItem(CART_CHANGED_AT_KEY)
      return
    }

    const storedSignature = window.localStorage.getItem(CART_SIGNATURE_KEY)
    if (storedSignature !== signature) {
      window.localStorage.setItem(CART_SIGNATURE_KEY, signature)
      window.localStorage.setItem(CART_CHANGED_AT_KEY, String(Date.now()))
    }

    const customer = readCustomer()
    if (!customer?.email) return

    const changedAt = Number(window.localStorage.getItem(CART_CHANGED_AT_KEY) || Date.now())
    const sentKey = `${CART_SENT_PREFIX}${customer.email}:${signature}`
    const lastSentAt = Number(window.localStorage.getItem(sentKey) || 0)
    if (lastSentAt && Date.now() - lastSentAt < RESEND_AFTER_MS) return

    const delay = Math.max(0, changedAt + REMINDER_DELAY_MS - Date.now())
    const timer = window.setTimeout(async () => {
      if (!readCustomer()?.email || createCartSignature(cart) !== window.localStorage.getItem(CART_SIGNATURE_KEY)) return

      const response = await fetch("/api/customer/cart-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: customer.name,
          email: customer.email,
          items: cart.map((item) => ({
            name: item.kit.name,
            club: item.kit.club,
            season: item.kit.season,
            size: item.size,
            quantity: item.quantity,
            unitPrice: getCartItemUnitPrice(item),
            version: getJerseyVersionLabel(item.version),
            backPrint: item.version === "embroidery" ? "" : getJerseyBackLabel(item.customization),
          })),
        }),
      }).catch(() => null)

      if (response?.ok) {
        window.localStorage.setItem(sentKey, String(Date.now()))
      }
    }, delay)

    return () => window.clearTimeout(timer)
  }, [cart, signature])

  return null
}

function createCartSignature(cart: ReturnType<typeof useStore>["cart"]) {
  if (cart.length === 0) return ""

  return cart
    .map((item) => [
      item.lineId,
      item.kit.id,
      item.size,
      item.quantity,
      item.version || "fan",
      item.customization?.mode || "original",
      item.customization?.name || "",
      item.customization?.number || "",
    ].join("|"))
    .sort()
    .join("::")
}

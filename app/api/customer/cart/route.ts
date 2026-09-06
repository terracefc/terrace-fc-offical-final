import { NextResponse } from "next/server"
import { readStoredCustomerCart, saveStoredCustomerCart } from "@/lib/customer-cart-storage"
import { GOOGLE_CUSTOMER_COOKIE, verifyCustomerPayload } from "@/lib/google-auth"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const customer = getSignedInCustomer(request)
  if (!customer) return NextResponse.json({ error: "Please sign in to load your saved cart." }, { status: 401 })

  const stored = await readStoredCustomerCart(customer.email)
  if (stored.error) return NextResponse.json({ error: "Your saved cart could not be loaded." }, { status: 500 })
  return NextResponse.json({ cart: stored.cart.items, updatedAt: stored.cart.updatedAt })
}

export async function PUT(request: Request) {
  const customer = getSignedInCustomer(request)
  if (!customer) return NextResponse.json({ error: "Please sign in to save your cart." }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!Array.isArray(body?.cart)) return NextResponse.json({ error: "A cart is required." }, { status: 400 })

  const serialized = JSON.stringify(body.cart)
  if (serialized.length > 250_000) {
    return NextResponse.json({ error: "Your cart is too large to save." }, { status: 413 })
  }

  const saved = await saveStoredCustomerCart(customer.email, body.cart)
  if (saved.error) return NextResponse.json({ error: "Your saved cart could not be updated." }, { status: 500 })
  return NextResponse.json({ ok: true, cart: saved.cart.items, updatedAt: saved.cart.updatedAt })
}

function getSignedInCustomer(request: Request) {
  const cookie = request.headers.get("cookie") || ""
  const value = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${GOOGLE_CUSTOMER_COOKIE}=`))
  const payload = value ? decodeURIComponent(value.slice(GOOGLE_CUSTOMER_COOKIE.length + 1)) : ""
  return verifyCustomerPayload(payload)
}

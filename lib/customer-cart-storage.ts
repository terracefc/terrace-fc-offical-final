import { readMongoSingleton, writeMongoSingleton } from "@/lib/mongodb"

const CUSTOMER_CARTS_COLLECTION = "customer_carts"

export type StoredCustomerCart = {
  items: unknown[]
  updatedAt: string
}

export async function readStoredCustomerCart(email: string) {
  const id = cartDocumentId(email)
  const stored = await readMongoSingleton<StoredCustomerCart>(CUSTOMER_CARTS_COLLECTION, id, {
    items: [],
    updatedAt: "",
  })

  return {
    cart: {
      items: normalizeCart(stored.value),
      updatedAt: typeof stored.value?.updatedAt === "string" ? stored.value.updatedAt : "",
    },
    error: stored.error,
  }
}

export async function saveStoredCustomerCart(email: string, items: unknown[]) {
  const cart: StoredCustomerCart = {
    items: normalizeCart({ items }),
    updatedAt: new Date().toISOString(),
  }
  const saved = await writeMongoSingleton(CUSTOMER_CARTS_COLLECTION, cartDocumentId(email), cart)
  return { cart, error: saved.error }
}

function cartDocumentId(email: string) {
  return `cart:${email.trim().toLowerCase()}`
}

function normalizeCart(value: unknown): unknown[] {
  const items = value && typeof value === "object" && Array.isArray((value as StoredCustomerCart).items)
    ? (value as StoredCustomerCart).items
    : []

  // Cart contents are customer-owned, but cap the payload so a bad client cannot
  // turn a saved cart into an oversized storage document.
  const safeItems = items.filter((item) => item && typeof item === "object").slice(0, 40)
  try {
    return JSON.parse(JSON.stringify(safeItems)) as unknown[]
  } catch {
    return []
  }
}

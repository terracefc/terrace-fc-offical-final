export const CUSTOMER_KEY = "terrace_customer"
export const CUSTOMER_ACCOUNTS_KEY = "terrace_customer_accounts"
export const CUSTOMER_AUTH_EVENT = "terrace:customer-auth-change"

export type CustomerAccount = {
  id: string
  name: string
  email: string
  phone: string
  createdAt: string
  passwordHash?: string
  savedAddress?: CustomerSavedAddress
}

export type CustomerSavedAddress = {
  houseNumber: string
  address: string
  deliveryInstructions?: string
  country?: string
  city: string
  state: string
  pincode: string
  latitude?: number
  longitude?: number
}

export function createCustomerId() {
  return `CUS-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
}

export function readCustomer() {
  if (typeof window === "undefined") return null

  try {
    const stored = window.localStorage.getItem(CUSTOMER_KEY)
    const parsed = stored ? JSON.parse(stored) : null
    if (!parsed || typeof parsed !== "object") return null
    if (typeof parsed.id !== "string" || typeof parsed.email !== "string") return null
    return parsed as CustomerAccount
  } catch {
    window.localStorage.removeItem(CUSTOMER_KEY)
    return null
  }
}

export function saveCustomer(customer: CustomerAccount) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(CUSTOMER_KEY, JSON.stringify(customer))
  upsertCustomerAccount(customer)
  window.dispatchEvent(new Event(CUSTOMER_AUTH_EVENT))
}

export function clearCustomer() {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(CUSTOMER_KEY)
  window.dispatchEvent(new Event(CUSTOMER_AUTH_EVENT))
}

export function readCustomerAccounts() {
  if (typeof window === "undefined") return []

  try {
    const stored = window.localStorage.getItem(CUSTOMER_ACCOUNTS_KEY)
    const parsed = stored ? JSON.parse(stored) : []
    return Array.isArray(parsed) ? parsed.filter(isCustomerAccount) as CustomerAccount[] : []
  } catch {
    window.localStorage.removeItem(CUSTOMER_ACCOUNTS_KEY)
    return []
  }
}

export function findCustomerAccount(email: string, phone?: string) {
  const normalizedEmail = email.trim().toLowerCase()

  return readCustomerAccounts().find((account) => {
    return account.email.toLowerCase() === normalizedEmail
  }) || null
}

export function upsertCustomerAccount(customer: CustomerAccount) {
  if (typeof window === "undefined") return

  const accounts = readCustomerAccounts()
  const next = [
    customer,
    ...accounts.filter((account) => account.id !== customer.id && account.email.toLowerCase() !== customer.email.toLowerCase()),
  ]
  window.localStorage.setItem(CUSTOMER_ACCOUNTS_KEY, JSON.stringify(next))
}

export async function fetchCustomerAccounts() {
  const response = await fetch("/api/customer/accounts", {
    cache: "no-store",
    credentials: "same-origin",
  })
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.error || "Customer accounts could not be loaded.")
  }
  const data = await response.json()
  return Array.isArray(data.accounts) ? data.accounts as CustomerAccount[] : []
}

export async function fetchCustomerAccount(email: string) {
  const response = await fetch(`/api/customer/accounts?email=${encodeURIComponent(email.trim().toLowerCase())}`)
  if (!response.ok) return findCustomerAccount(email)
  const data = await response.json()
  return (data.account || null) as CustomerAccount | null
}

export async function loginCustomerWithPassword(email: string, password: string) {
  const response = await fetch("/api/customer/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || "Login failed.")
  return data.customer as CustomerAccount
}

export async function hashCustomerPassword(password: string) {
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    return password
  }

  const encoded = new TextEncoder().encode(password)
  const digest = await window.crypto.subtle.digest("SHA-256", encoded)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

export async function verifyCustomerPassword(account: CustomerAccount, password: string) {
  if (!account.passwordHash) return false
  return account.passwordHash === await hashCustomerPassword(password)
}

function isCustomerAccount(value: unknown): value is CustomerAccount {
  if (!value || typeof value !== "object") return false
  const account = value as Partial<CustomerAccount>
  return typeof account.id === "string" && typeof account.name === "string" && typeof account.email === "string" && typeof account.phone === "string"
}

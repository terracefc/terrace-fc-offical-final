import { NextResponse } from "next/server"
import { isAdminRequest } from "@/lib/admin-auth"
import { deleteStoredCustomerAccount, readStoredCustomerAccounts, upsertStoredCustomerAccount } from "@/lib/customer-account-storage"
import { GOOGLE_CUSTOMER_COOKIE, verifyCustomerPayload } from "@/lib/google-auth"
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase-admin"
import type { CustomerAccount } from "@/lib/customer-auth"

export async function GET(request: Request) {
  if (!isSupabaseAdminConfigured || !supabaseAdmin) {
    return NextResponse.json({ accounts: [], account: null })
  }

  const url = new URL(request.url)
  const email = url.searchParams.get("email")?.trim().toLowerCase()
  const isAdmin = isAdminRequest(request)

  if (email) {
    const { users, error } = await listAllUsers()
    if (error) return NextResponse.json({ error }, { status: 500 })

    const user = users.find((candidate) => candidate.email?.toLowerCase() === email)
    const stored = await readStoredCustomerAccounts()
    const storedAccount = stored.accounts.find((account) => account.email.toLowerCase() === email)
    return NextResponse.json({ account: user ? mapUserToCustomer(user) : storedAccount || null })
  }

  if (!isAdmin) {
    return NextResponse.json({ error: "Admin access is required." }, { status: 401 })
  }

  const { users, error } = await listAllUsers()
  if (error) return NextResponse.json({ error }, { status: 500 })

  const stored = await readStoredCustomerAccounts()
  return NextResponse.json({
    accounts: mergeAccounts([
      ...users
      .filter((user) => user.email && !user.email.endsWith("@terracefc.local"))
      .map(mapUserToCustomer),
      ...stored.accounts,
    ]).sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
  })
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null)
  const email = String(body?.email || "").trim().toLowerCase()
  const phone = String(body?.phone || "").replace(/\D/g, "").slice(-10)

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 })
  }
  if (!/^[6-9]\d{9}$/.test(phone)) {
    return NextResponse.json({ error: "Enter a valid 10 digit Indian mobile number." }, { status: 400 })
  }
  const isAdmin = isAdminRequest(request)
  const googleCustomer = verifyCustomerPayload(getCookie(request, GOOGLE_CUSTOMER_COOKIE))
  if (!isAdmin && googleCustomer?.email?.toLowerCase() !== email) {
    return NextResponse.json({ error: "Google login session expired." }, { status: 401 })
  }

  if (!isSupabaseAdminConfigured || !supabaseAdmin) {
    return NextResponse.json({ error: "Customer accounts are not configured." }, { status: 500 })
  }

  const { users, error } = await listAllUsers()
  if (error) return NextResponse.json({ error }, { status: 500 })

  const user = users.find((candidate) => candidate.email?.toLowerCase() === email)
  if (!user) return NextResponse.json({ error: "Customer account was not found." }, { status: 404 })

  const { data, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...(user.user_metadata || {}),
      phone,
    },
  })
  if (updateError || !data.user) {
    return NextResponse.json({ error: updateError?.message || "Phone number could not be saved." }, { status: 500 })
  }

  const customer = mapUserToCustomer(data.user)
  await upsertStoredCustomerAccount(customer)
  const response = NextResponse.json({ customer })
  if (googleCustomer) response.cookies.delete(GOOGLE_CUSTOMER_COOKIE)
  return response
}

export async function DELETE(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Admin access is required." }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const email = String(body?.email || "").trim().toLowerCase()
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 })
  }

  if (!isSupabaseAdminConfigured || !supabaseAdmin) {
    return NextResponse.json({ error: "Customer accounts are not configured." }, { status: 500 })
  }

  const { users, error } = await listAllUsers()
  if (error) return NextResponse.json({ error }, { status: 500 })

  const user = users.find((candidate) => candidate.email?.toLowerCase() === email)
  if (user && user.email?.endsWith("@terracefc.local")) {
    return NextResponse.json({ error: "Internal storage accounts cannot be deleted." }, { status: 400 })
  }

  if (user) {
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id)
    if (deleteError) return NextResponse.json({ error: deleteError.message || "Customer account could not be deleted." }, { status: 500 })
  }

  const stored = await deleteStoredCustomerAccount(email)
  if (stored.error && !stored.error.includes("not found")) {
    return NextResponse.json({ error: stored.error }, { status: 500 })
  }

  if (!user && stored.deleted !== true) {
    return NextResponse.json({ error: "Customer account was not found." }, { status: 404 })
  }

  return NextResponse.json({ ok: true, deleted: true, email })
}

async function listAllUsers() {
  const users: any[] = []
  const perPage = 1000

  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabaseAdmin!.auth.admin.listUsers({ page, perPage })
    if (error) return { users: [], error: error.message || "Customer accounts could not be read." }
    users.push(...(data.users || []))
    if ((data.users || []).length < perPage) break
  }

  return { users, error: null }
}

function getCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") || ""
  const match = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : ""
}

function mapUserToCustomer(user: any): CustomerAccount {
  return {
    id: user.user_metadata?.customer_id || user.id,
    name: user.user_metadata?.name || user.email?.split("@")[0] || "Customer",
    email: user.email || "",
    phone: user.user_metadata?.phone || "",
    createdAt: user.created_at || new Date().toISOString(),
    savedAddress: user.user_metadata?.saved_address || undefined,
  }
}

function mergeAccounts(accounts: CustomerAccount[]) {
  const byEmail = new Map<string, CustomerAccount>()
  accounts.forEach((account) => {
    const email = account.email.toLowerCase()
    const existing = byEmail.get(email)
    if (!existing || (!existing.phone && account.phone) || new Date(account.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
      byEmail.set(email, { ...existing, ...account, phone: account.phone || existing?.phone || "" })
    }
  })
  return Array.from(byEmail.values())
}

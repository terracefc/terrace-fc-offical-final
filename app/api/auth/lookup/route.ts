import { NextRequest, NextResponse } from "next/server"
import { findSupabaseAuthUserByEmail, isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin"
import { readStoredCustomerAccounts } from "@/lib/customer-account-storage"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const identifier = request.nextUrl.searchParams.get("identifier") || ""
  const normalized = normalizeIdentifier(identifier)
  if (!normalized) {
    return NextResponse.json({ error: "Enter a valid email or Indian mobile number." }, { status: 400 })
  }

  if (!isSupabaseAdminConfigured || !supabaseAdmin) {
    const stored = await readStoredCustomerAccounts()
    const exists = normalized.kind === "email"
      ? stored.accounts.some((account) => account.email.toLowerCase() === normalized.value)
      : stored.accounts.some((account) => String(account.phone || "").replace(/\D/g, "").slice(-10) === normalized.value.slice(-10))
    return NextResponse.json({ exists, kind: normalized.kind })
  }

  if (normalized.kind === "email") {
    const result = await findSupabaseAuthUserByEmail(normalized.value)
    if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })
    if (result.user) return NextResponse.json({ exists: true, kind: normalized.kind })

    const stored = await readStoredCustomerAccounts()
    if (stored.accounts.some((account) => account.email.toLowerCase() === normalized.value)) {
      return NextResponse.json({ exists: true, kind: normalized.kind })
    }

    return NextResponse.json({ exists: false, kind: normalized.kind })
  }

  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const exists = (data.users || []).some((user) => String(user.user_metadata?.phone || "").replace(/\D/g, "").slice(-10) === normalized.value.slice(-10))
    if (exists || (data.users || []).length < 1000) return NextResponse.json({ exists, kind: normalized.kind })
  }

  return NextResponse.json({ exists: false, kind: normalized.kind })
}

function normalizeIdentifier(value: string) {
  const trimmed = value.trim()
  if (/^\S+@\S+\.\S+$/.test(trimmed)) return { kind: "email" as const, value: trimmed.toLowerCase() }

  let digits = trimmed.replace(/\D/g, "")
  if (digits.length > 10 && digits.startsWith("91")) digits = digits.slice(2)
  digits = digits.slice(0, 10)
  if (/^[6-9]\d{9}$/.test(digits)) return { kind: "phone" as const, value: digits }
  return null
}

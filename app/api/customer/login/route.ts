import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { upsertStoredCustomerAccount } from "@/lib/customer-account-storage"
import { loginNoticeEmailHtml, sendEmail } from "@/lib/email"
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin"

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const email = String(body?.email || "").trim().toLowerCase()
  const password = String(body?.password || "")

  if (!/^\S+@\S+\.\S+$/.test(email) || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_sba_08338b7e2d29635e8743b3938fd5333778e65742_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const supabaseAnonKey = process.env.NEXT_PUBLIC_sba_08338b7e2d29635e8743b3938fd5333778e65742_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "Customer login is not configured." }, { status: 500 })
  }

  if (isSupabaseAdminConfigured && supabaseAdmin) {
    const existingUser = await findUserByEmail(email)
    if (!existingUser) {
      return NextResponse.json({ error: "No account found. Please create an account first." }, { status: 404 })
    }
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.user) {
    return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 })
  }

  const customer = {
    id: data.user.user_metadata?.customer_id || data.user.id,
    name: data.user.user_metadata?.name || data.user.email?.split("@")[0] || "Customer",
    email: data.user.email || email,
    phone: data.user.user_metadata?.phone || "",
    createdAt: data.user.created_at || new Date().toISOString(),
  }

  await sendEmail({
    to: customer.email,
    subject: "New terrace.fc login",
    html: loginNoticeEmailHtml(customer.name),
  })

  await upsertStoredCustomerAccount(customer)

  return NextResponse.json({ customer })
}

async function findUserByEmail(email: string) {
  if (!supabaseAdmin) return null

  const perPage = 1000
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
    if (error) return null

    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase())
    if (user) return user
    if ((data.users || []).length < perPage) break
  }

  return null
}

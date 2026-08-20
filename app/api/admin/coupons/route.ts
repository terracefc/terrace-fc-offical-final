import { NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { normalizeCoupons } from "@/lib/coupons"
import { getCouponUsageCounts } from "@/lib/coupon-usage"
import { findSupabaseAuthUserByEmail, isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin"
import { isAdminRequest } from "@/lib/admin-auth"

const COUPONS_EMAIL = "site-coupons@terracefc.local"

export async function GET() {
  const { coupons, error } = await readCoupons()

  if (error) {
    return NextResponse.json({ error }, { status: 500 })
  }

  const usageCounts = await getCouponUsageCounts(coupons.map((coupon) => coupon.code))
  return NextResponse.json({
    coupons: coupons.map((coupon) => ({ ...coupon, usageUsed: usageCounts[coupon.code] || 0 })),
  })
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Admin access is required." }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const coupons = normalizeCoupons(body?.coupons)
  const saved = await saveCoupons(coupons)

  if (saved.error) {
    return NextResponse.json({ error: saved.error }, { status: 500 })
  }

  const usageCounts = await getCouponUsageCounts(coupons.map((coupon) => coupon.code))
  return NextResponse.json({
    coupons: coupons.map((coupon) => ({ ...coupon, usageUsed: usageCounts[coupon.code] || 0 })),
  })
}

async function readCoupons() {
  const { user, error } = await findSupabaseAuthUserByEmail(COUPONS_EMAIL)

  if (error) return { coupons: [], error }
  return { coupons: normalizeCoupons(user?.user_metadata?.coupons), error: null }
}

async function saveCoupons(coupons: unknown) {
  if (!isSupabaseAdminConfigured || !supabaseAdmin) {
    return { error: "Coupon storage is not configured." }
  }

  const { user: existingUser, error: findError } = await findSupabaseAuthUserByEmail(COUPONS_EMAIL)
  if (findError) return { error: findError }

  const metadata = { coupons: normalizeCoupons(coupons).map(({ usageUsed, perAccountUsageUsed, ...coupon }) => coupon) }

  if (existingUser) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
      user_metadata: {
        ...existingUser.user_metadata,
        ...metadata,
      },
    })
    return { error: error?.message || null }
  }

  const { error } = await supabaseAdmin.auth.admin.createUser({
    email: COUPONS_EMAIL,
    password: randomUUID(),
    email_confirm: true,
    user_metadata: metadata,
  })

  return { error: error?.message || null }
}

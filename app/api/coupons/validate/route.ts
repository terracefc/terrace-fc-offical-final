import { NextResponse } from "next/server"
import { normalizeCoupons, validateCouponFromList } from "@/lib/coupons"
import { getCouponUsageSummary } from "@/lib/coupon-usage"
import { findSupabaseAuthUserByEmail } from "@/lib/supabase-admin"

const COUPONS_EMAIL = "site-coupons@terracefc.local"
const PARTIAL_COD_CODE = (process.env.PARTIAL_COD_COUPON_CODE || "LOCALCOD").trim().toUpperCase()

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const code = String(body?.code || "")
  const subtotal = Number(body?.subtotal || 0)
  const itemCount = Math.max(0, Number(body?.itemCount || 0))
  const customerEmail = String(body?.customerEmail || "").trim().toLowerCase()

  if (!code.trim()) {
    return NextResponse.json({ isValid: false, reason: "Enter a coupon code.", discountAmount: 0 })
  }

  const { coupons, error } = await readCoupons()

  if (error) {
    return NextResponse.json(
      {
        isValid: false,
        reason: "Coupon service is temporarily unavailable.",
        discountAmount: 0,
      },
      { status: 503 },
    )
  }

  const cleanCode = code.trim().toUpperCase()
  if (cleanCode === "TEST1") {
    return NextResponse.json({
      isValid: true,
      coupon: {
        code: "TEST1",
        discountType: "fixed",
        discountValue: 0,
        testTotal: 0,
        description: "Test checkout — final total ₹0.",
        isActive: true,
      },
      discountAmount: Math.max(0, subtotal),
    })
  }

  if (cleanCode === "ONE1") {
    return NextResponse.json({
      isValid: true,
      coupon: {
        code: "ONE1",
        discountType: "fixed",
        discountValue: 0,
        testTotal: 1,
        description: "Test checkout — final total ₹1.",
        isActive: true,
      },
      discountAmount: Math.max(0, subtotal - 1),
    })
  }

  if (cleanCode === PARTIAL_COD_CODE) {
    return NextResponse.json({
      isValid: true,
      coupon: {
        code: cleanCode,
        description: "Private partial COD access",
        partialCod: true,
      },
      discountAmount: 0,
    })
  }
  const usage = await getCouponUsageSummary([cleanCode], customerEmail)
  return NextResponse.json(validateCouponFromList(cleanCode, subtotal, coupons, usage.total, usage.account, itemCount))
}

async function readCoupons() {
  const { user, error } = await findSupabaseAuthUserByEmail(COUPONS_EMAIL)

  if (error) return { coupons: [], error }
  return { coupons: normalizeCoupons(user?.user_metadata?.coupons), error: null }
}

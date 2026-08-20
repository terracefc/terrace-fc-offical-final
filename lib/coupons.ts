export type Coupon = {
  code: string
  discountType: "percentage" | "fixed"
  discountValue: number
  minSubtotal?: number
  minItems?: number
  usageLimit?: number
  usageUsed?: number
  perAccountUsageLimit?: number
  perAccountUsageUsed?: number
  testTotal?: number
  freeOrder?: boolean
  prepaidOnly?: boolean
  partialCod?: boolean
  description: string
  isActive: boolean
}

export type CouponValidationResult = {
  isValid: boolean
  reason?: string
  coupon?: Coupon
  discountAmount: number
}

const COUPONS_KEY = "terrace_coupons"
export const PREPAID_CODE = "PREPAID"
export const COLAB_CODE = "COLAB"
export const TEST_ZERO_CODE = "TEST1"
export const WELCOME_CODE = "WELCOME100"

export function isComplimentaryCode(code: string | undefined | null) {
  const normalized = String(code || "").trim().toUpperCase()
  return normalized === PREPAID_CODE || normalized === COLAB_CODE || normalized === TEST_ZERO_CODE
}

export const DEFAULT_COUPONS: Coupon[] = [
  {
    code: WELCOME_CODE,
    discountType: "fixed",
    discountValue: 100,
    description: "Welcome offer — ₹100 off your order.",
    isActive: true,
  },
  {
    code: PREPAID_CODE,
    discountType: "percentage",
    discountValue: 100,
    usageLimit: 1,
    description: "Private complimentary order recorded as prepaid.",
    isActive: true,
    freeOrder: true,
    prepaidOnly: true,
  },
  {
    code: COLAB_CODE,
    discountType: "percentage",
    discountValue: 100,
    description: "Collaboration complimentary order.",
    isActive: true,
    freeOrder: true,
  },
  {
    code: "LOCALCOD",
    discountType: "fixed",
    discountValue: 0,
    description: "Private partial COD access.",
    isActive: true,
    partialCod: true,
  },
  {
    code: "FRIENDSS",
    discountType: "fixed",
    discountValue: 298,
    minItems: 3,
    description: "Flat ₹298 off on 3 jerseys.",
    isActive: true,
  },
  {
    code: TEST_ZERO_CODE,
    discountType: "fixed",
    discountValue: 0,
    testTotal: 0,
    description: "Test checkout — final total ₹0.",
    isActive: true,
  },
  {
    code: "ONE1",
    discountType: "fixed",
    discountValue: 0,
    testTotal: 1,
    description: "Test checkout — final total ₹1.",
    isActive: true,
  },
]

export function normalizeCoupons(value: unknown): Coupon[] {
  if (!Array.isArray(value)) return DEFAULT_COUPONS

  const normalized = value
    .filter(isCoupon)
    .map((coupon) => ({
      ...coupon,
      code: coupon.code.trim().toUpperCase(),
      description: coupon.description.trim(),
      discountValue: Number(coupon.discountValue),
      minSubtotal: coupon.minSubtotal === undefined || String(coupon.minSubtotal).trim() === "" ? undefined : Number(coupon.minSubtotal),
      minItems: coupon.minItems === undefined || String(coupon.minItems).trim() === "" ? undefined : Number(coupon.minItems),
      usageLimit: coupon.usageLimit === undefined || String(coupon.usageLimit).trim() === "" ? undefined : Number(coupon.usageLimit),
      usageUsed: coupon.usageUsed === undefined || String(coupon.usageUsed).trim() === "" ? undefined : Number(coupon.usageUsed),
      perAccountUsageLimit: coupon.perAccountUsageLimit === undefined || String(coupon.perAccountUsageLimit).trim() === "" ? undefined : Number(coupon.perAccountUsageLimit),
      perAccountUsageUsed: coupon.perAccountUsageUsed === undefined || String(coupon.perAccountUsageUsed).trim() === "" ? undefined : Number(coupon.perAccountUsageUsed),
      testTotal: coupon.testTotal === undefined || String(coupon.testTotal).trim() === "" ? undefined : Number(coupon.testTotal),
      isActive: coupon.isActive === true || String(coupon.isActive).toLowerCase() === "true",
    }))

  const existingCodes = new Set(normalized.map((coupon) => coupon.code))
  return [
    ...normalized,
    ...DEFAULT_COUPONS.filter((coupon) => !existingCodes.has(coupon.code)),
  ]
}

export function readCoupons(): Coupon[] {
  if (typeof window === "undefined") return DEFAULT_COUPONS

  try {
    const stored = window.localStorage.getItem(COUPONS_KEY)
    if (!stored) return DEFAULT_COUPONS
    return normalizeCoupons(JSON.parse(stored))
  } catch {
    window.localStorage.removeItem(COUPONS_KEY)
    return DEFAULT_COUPONS
  }
}

export function writeCoupons(coupons: Coupon[]) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(COUPONS_KEY, JSON.stringify(normalizeCoupons(coupons)))
}

export function saveCoupon(coupon: Coupon) {
  if (typeof window === "undefined") return

  const newCoupon = normalizeCoupons([coupon])[0]
  if (!newCoupon) return

  const coupons = readCoupons()
  const next = [newCoupon, ...coupons.filter((current) => current.code !== newCoupon.code)]
  writeCoupons(next)
}

export function deleteCoupon(code: string) {
  if (typeof window === "undefined") return

  const cleanCode = code.trim().toUpperCase()
  writeCoupons(readCoupons().filter((coupon) => coupon.code !== cleanCode))
}

export function validateCoupon(code: string, subtotal: number, itemCount = 0): CouponValidationResult {
  return validateCouponFromList(code, subtotal, readCoupons(), {}, {}, itemCount)
}

export function validateCouponFromList(
  code: string,
  subtotal: number,
  coupons: Coupon[],
  usageCounts: Record<string, number> = {},
  accountUsageCounts: Record<string, number> = {},
  itemCount = 0,
): CouponValidationResult {
  const cleanCode = code.trim().toUpperCase()
  const coupon = coupons.find((current) => current.code === cleanCode)

  if (!coupon) {
    return { isValid: false, reason: "Invalid coupon code.", discountAmount: 0 }
  }

  if (!coupon.isActive) {
    return { isValid: false, reason: "This coupon is no longer active.", discountAmount: 0 }
  }

  if (coupon.minSubtotal && subtotal < coupon.minSubtotal) {
    return {
      isValid: false,
      reason: `Minimum subtotal of ₹${coupon.minSubtotal} required for this coupon.`,
      discountAmount: 0,
    }
  }

  if (coupon.minItems && itemCount < coupon.minItems) {
    return {
      isValid: false,
      reason: `Add at least ${coupon.minItems} jerseys to use this coupon.`,
      discountAmount: 0,
    }
  }

  const usageUsed = usageCounts[cleanCode] ?? coupon.usageUsed ?? 0
  if (coupon.usageLimit !== undefined && usageUsed >= coupon.usageLimit) {
    return { isValid: false, reason: "This coupon has reached its total usage limit.", discountAmount: 0 }
  }

  const accountUsageUsed = accountUsageCounts[cleanCode] ?? coupon.perAccountUsageUsed ?? 0
  if (coupon.perAccountUsageLimit !== undefined && accountUsageUsed >= coupon.perAccountUsageLimit) {
    return { isValid: false, reason: "This coupon has reached the usage limit for this account.", discountAmount: 0 }
  }

  if (coupon.testTotal !== undefined) {
    return {
      isValid: true,
      coupon,
      discountAmount: Math.max(0, subtotal - coupon.testTotal),
    }
  }

  const rawDiscountAmount = coupon.freeOrder
    ? subtotal
    : coupon.discountType === "percentage"
      ? Math.round((subtotal * coupon.discountValue) / 100)
      : coupon.discountValue

  return {
    isValid: true,
    coupon,
    discountAmount: Math.min(rawDiscountAmount, subtotal),
  }
}

function isCoupon(value: unknown): value is Coupon {
  if (!value || typeof value !== "object") return false
  const coupon = value as Partial<Coupon>

  return (
    typeof coupon.code === "string" &&
    (coupon.discountType === "percentage" || coupon.discountType === "fixed") &&
    Number.isFinite(Number(coupon.discountValue)) &&
    typeof coupon.description === "string" &&
    (typeof coupon.isActive === "boolean" || typeof coupon.isActive === "string") &&
    (coupon.minSubtotal === undefined || String(coupon.minSubtotal).trim() === "" || Number.isFinite(Number(coupon.minSubtotal))) &&
    (coupon.minItems === undefined || String(coupon.minItems).trim() === "" || Number.isFinite(Number(coupon.minItems))) &&
    (coupon.usageLimit === undefined || String(coupon.usageLimit).trim() === "" || Number.isFinite(Number(coupon.usageLimit))) &&
    (coupon.usageUsed === undefined || String(coupon.usageUsed).trim() === "" || Number.isFinite(Number(coupon.usageUsed))) &&
    (coupon.perAccountUsageLimit === undefined || String(coupon.perAccountUsageLimit).trim() === "" || Number.isFinite(Number(coupon.perAccountUsageLimit))) &&
    (coupon.perAccountUsageUsed === undefined || String(coupon.perAccountUsageUsed).trim() === "" || Number.isFinite(Number(coupon.perAccountUsageUsed))) &&
    (coupon.testTotal === undefined || String(coupon.testTotal).trim() === "" || Number.isFinite(Number(coupon.testTotal)))
  )
}

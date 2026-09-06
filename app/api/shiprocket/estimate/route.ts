import { NextRequest, NextResponse } from "next/server"
import { getShiprocketDeliveryDays } from "@/lib/shiprocket"

const EXTRA_FULFILLMENT_DAYS = 6
const BANGALORE_PIN_PREFIX = "560"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const pincode = (searchParams.get("pincode") || "").replace(/\D/g, "").slice(0, 6)
  const city = (searchParams.get("city") || "").toLowerCase()

  if (!/^\d{6}$/.test(pincode)) {
    return NextResponse.json({ error: "A valid delivery PIN code is required." }, { status: 400 })
  }

  const isBangalore = pincode.startsWith(BANGALORE_PIN_PREFIX) || city.includes("bangalore") || city.includes("bengaluru")

  try {
    const courierDays = isBangalore ? 1 : await getShiprocketDeliveryDays(pincode)
    const totalDays = (courierDays || 4) + EXTRA_FULFILLMENT_DAYS
    return NextResponse.json({
      days: totalDays,
      courierDays: courierDays || null,
      estimatedDate: addDays(new Date(), totalDays).toISOString(),
      source: isBangalore ? "bangalore" : courierDays ? "shiprocket" : "fallback",
    })
  } catch {
    const totalDays = (isBangalore ? 1 : 4) + EXTRA_FULFILLMENT_DAYS
    return NextResponse.json({
      days: totalDays,
      courierDays: isBangalore ? 1 : null,
      estimatedDate: addDays(new Date(), totalDays).toISOString(),
      source: isBangalore ? "bangalore" : "fallback",
    })
  }
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

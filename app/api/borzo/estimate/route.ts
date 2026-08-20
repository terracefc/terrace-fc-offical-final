import { NextRequest, NextResponse } from "next/server"
import { calculateBorzoDeliveryEstimate, isBorzoConfigured } from "@/lib/borzo"
import { createOrderId, type StoreOrder } from "@/lib/orders"

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const address = body?.address

  if (!address?.phone || !address?.address || !address?.city || !address?.state || !address?.pincode) {
    return NextResponse.json({ error: "Delivery address is incomplete." }, { status: 400 })
  }

  if (!isBorzoConfigured()) {
    return NextResponse.json({ error: "Borzo is not configured." }, { status: 500 })
  }

  const order = buildEstimateOrder(body)

  try {
    const estimate = await calculateBorzoDeliveryEstimate(order, { test: process.env.BORZO_API_BASE?.includes("robotapitest") })
    return NextResponse.json({
      price: estimate.price,
      roundedPrice: roundUpToNearestTen(estimate.price),
      estimatedDate: estimate.estimatedDate,
    })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Borzo delivery price could not be checked.",
    }, { status: 502 })
  }
}

function buildEstimateOrder(body: any): StoreOrder {
  const quantity = Math.max(1, Number(body?.quantity || 1))
  return {
    id: `EST-${createOrderId()}`,
    createdAt: new Date().toISOString(),
    status: "test",
    fulfillmentStatus: "confirmed",
    deliveryOption: "expedited",
    shippingProvider: "borzo",
    address: {
      name: body.address.name || "Customer",
      phone: body.address.phone,
      email: body.address.email || process.env.RESEND_TEST_RECIPIENT || "orders@terracefc.com",
      houseNumber: body.address.houseNumber || "",
      address: body.address.address,
      city: body.address.city,
      state: body.address.state,
      pincode: body.address.pincode,
      latitude: body.address.latitude,
      longitude: body.address.longitude,
    },
    items: [{
      id: 1,
      name: "terrace.fc jersey",
      club: "terrace.fc",
      season: "Checkout",
      size: "M",
      quantity,
      price: 1,
      version: "fan",
    }],
    subtotal: 1,
    deliveryCharge: 0,
    total: 1,
  }
}

function roundUpToNearestTen(value: number) {
  return Math.max(100, Math.ceil(value / 10) * 10)
}

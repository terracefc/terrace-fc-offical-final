import { NextResponse } from "next/server"
import { abandonedCartEmailHtml, sendEmail } from "@/lib/email"

type ReminderItem = {
  name?: unknown
  club?: unknown
  season?: unknown
  size?: unknown
  quantity?: unknown
  unitPrice?: unknown
  version?: unknown
  backPrint?: unknown
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const name = String(body?.name || "there").trim().slice(0, 80) || "there"
  const email = String(body?.email || "").trim().toLowerCase()
  const items = normalizeItems(body?.items)

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: "A valid customer email is required." }, { status: 400 })
  }

  if (items.length === 0) {
    return NextResponse.json({ error: "Cart is empty." }, { status: 400 })
  }

  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
  const result = await sendEmail({
    to: email,
    subject: "Your terrace.fc cart is waiting",
    html: abandonedCartEmailHtml({ name, items, subtotal }),
  })

  return NextResponse.json({ ok: true, emailSent: result.sent, reason: result.reason })
}

function normalizeItems(value: unknown) {
  if (!Array.isArray(value)) return []

  return value
    .map((item: ReminderItem) => {
      const name = String(item?.name || "").trim()
      const size = String(item?.size || "").trim()
      const quantity = Math.max(1, Math.min(10, Number(item?.quantity || 1)))
      const unitPrice = Math.max(0, Math.min(50000, Number(item?.unitPrice || 0)))

      if (!name || !size || !Number.isFinite(quantity) || !Number.isFinite(unitPrice) || unitPrice <= 0) {
        return null
      }

      return {
        name: name.slice(0, 120),
        club: String(item?.club || "").trim().slice(0, 80),
        season: String(item?.season || "").trim().slice(0, 80),
        size: size.slice(0, 12),
        quantity,
        unitPrice,
        version: String(item?.version || "").trim().slice(0, 80),
        backPrint: String(item?.backPrint || "").trim().slice(0, 120),
      }
    })
    .filter(Boolean)
    .slice(0, 12)
}

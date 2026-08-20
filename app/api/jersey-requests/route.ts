import { NextResponse } from "next/server"
import { isAdminRequest } from "@/lib/admin-auth"
import { adminJerseyRequestMessageEmailHtml, adminJerseyRequestNotificationEmailHtml, customerJerseyRequestMessageEmailHtml, customerJerseyRequestStatusEmailHtml, sendEmail } from "@/lib/email"
import { createJerseyRequestId, type JerseyRequest, type JerseyRequestMessage } from "@/lib/jersey-requests"
import { readJerseyRequests, saveJerseyRequests } from "@/lib/jersey-request-storage"

export const runtime = "nodejs"

const ADMIN_NOTIFICATION_EMAIL = "terrace.fc@terracefc.com"
const MAX_REQUEST_PHOTO_BYTES = 2 * 1024 * 1024

export async function GET(request: Request) {
  const url = new URL(request.url)
  const isAdmin = isAdminRequest(request)
  const customerEmail = String(url.searchParams.get("email") || "").trim().toLowerCase()

  const stored = await readJerseyRequests()
  if (stored.error) return NextResponse.json({ error: stored.error }, { status: 500 })

  if (customerEmail) {
    return NextResponse.json({
      requests: stored.requests.filter((item) => item.email.toLowerCase() === customerEmail),
    })
  }
  if (isAdmin) return NextResponse.json({ requests: stored.requests })

  return NextResponse.json({ error: "Email is required." }, { status: 400 })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const name = String(body?.name || "").trim()
  const email = String(body?.email || "").trim().toLowerCase()
  const clubOrCountry = String(body?.clubOrCountry || "").trim()
  const playerName = String(body?.playerName || "").trim()
  const number = String(body?.number || "").trim()
  const year = String(body?.year || "").trim()
  const notes = String(body?.notes || "").trim()
  const photo = normalizeRequestPhoto(body?.photo)

  if (!name || !email || !clubOrCountry || !playerName || !year) {
    return NextResponse.json({ error: "Name, email, club/country, player, and year are required." }, { status: 400 })
  }

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 })
  }

  const stored = await readJerseyRequests()
  if (stored.error) return NextResponse.json({ error: stored.error }, { status: 500 })

  const now = new Date().toISOString()
  const jerseyRequest: JerseyRequest = {
    id: createJerseyRequestId(),
    name,
    email,
    clubOrCountry,
    playerName,
    number,
    year,
    notes,
    photo,
    status: "new",
    createdAt: now,
    updatedAt: now,
  }

  const saved = await saveJerseyRequests([jerseyRequest, ...stored.requests])
  if (saved.error) return NextResponse.json({ error: saved.error }, { status: 500 })

  const result = await sendEmail({
    to: ADMIN_NOTIFICATION_EMAIL,
    subject: `New terrace.fc jersey request - ${jerseyRequest.id}`,
    html: adminJerseyRequestNotificationEmailHtml(jerseyRequest),
  })
  if (!result.sent) {
    console.warn(`Jersey request notification email not sent for ${jerseyRequest.id}: ${result.reason || "unknown reason"}`)
  }

  return NextResponse.json({ request: jerseyRequest })
}

function normalizeRequestPhoto(value: unknown) {
  if (!value || typeof value !== "object") return undefined
  const item = value as Record<string, unknown>
  const name = String(item.name || "").trim()
  const type = String(item.type || "").trim()
  const dataUrl = String(item.dataUrl || "").trim()
  const size = Number(item.size || 0)

  if (!name || !type.startsWith("image/") || !dataUrl.startsWith("data:image/") || !Number.isFinite(size) || size <= 0 || size > MAX_REQUEST_PHOTO_BYTES) {
    return undefined
  }

  return {
    id: String(item.id || crypto.randomUUID()),
    name: name.slice(0, 120),
    type: type.slice(0, 80),
    size,
    dataUrl,
  }
}

export async function PATCH(request: Request) {
  const isAdmin = isAdminRequest(request)
  const body = await request.json().catch(() => null)
  const requestId = String(body?.requestId || "")
  const status = body?.status === "reviewed" || body?.status === "done" || body?.status === "new" ? body.status : undefined
  const sender = body?.sender === "customer" ? "customer" : "admin"
  const customerEmail = String(body?.email || "").trim().toLowerCase()
  const text = String(body?.message || "").trim()

  if (!requestId) return NextResponse.json({ error: "Request id is required." }, { status: 400 })
  if (status && !isAdmin) return NextResponse.json({ error: "Admin access is required." }, { status: 401 })
  if (sender === "admin" && !isAdmin) return NextResponse.json({ error: "Admin access is required." }, { status: 401 })
  if (sender === "customer" && !customerEmail) return NextResponse.json({ error: "Customer email is required." }, { status: 400 })
  if (!status && !text) return NextResponse.json({ error: "Status or message is required." }, { status: 400 })

  const stored = await readJerseyRequests()
  if (stored.error) return NextResponse.json({ error: stored.error }, { status: 500 })

  const target = stored.requests.find((request) => request.id === requestId)
  if (!target) return NextResponse.json({ error: "Request not found." }, { status: 404 })
  if (sender === "customer" && target.email.toLowerCase() !== customerEmail) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 })
  }

  const now = new Date().toISOString()
  const requests = stored.requests.map((request) => {
    if (request.id !== requestId) return request
    const nextMessages = text ? [
      ...(request.messages || []),
      {
        id: crypto.randomUUID(),
        sender,
        senderName: sender === "admin" ? "terrace.fc" : request.name,
        text,
        createdAt: now,
      } satisfies JerseyRequestMessage,
    ] : (request.messages || [])

    return { ...request, status: status || request.status, messages: nextMessages, updatedAt: now }
  })
  const updated = requests.find((request) => request.id === requestId)

  if (!updated) return NextResponse.json({ error: "Request not found." }, { status: 404 })

  const saved = await saveJerseyRequests(requests)
  if (saved.error) return NextResponse.json({ error: saved.error }, { status: 500 })

  if (status) {
    const result = await sendEmail({
      to: updated.email,
      subject: `terrace.fc jersey request update - ${updated.id}`,
      html: customerJerseyRequestStatusEmailHtml(updated),
    })
    if (!result.sent) {
      console.warn(`Customer jersey request email not sent for ${updated.id}: ${result.reason || "unknown reason"}`)
    }
  }

  if (text && sender === "customer") {
    const result = await sendEmail({
      to: ADMIN_NOTIFICATION_EMAIL,
      subject: `New jersey request message - ${updated.id}`,
      html: adminJerseyRequestMessageEmailHtml(updated, text),
    })
    if (!result.sent) console.warn(`Admin jersey message email not sent for ${updated.id}: ${result.reason || "unknown reason"}`)
  }

  if (text && sender === "admin") {
    const result = await sendEmail({
      to: updated.email,
      subject: `terrace.fc replied to your jersey request - ${updated.id}`,
      html: customerJerseyRequestMessageEmailHtml(updated, text),
    })
    if (!result.sent) console.warn(`Customer jersey message email not sent for ${updated.id}: ${result.reason || "unknown reason"}`)
  }

  return NextResponse.json({ request: updated })
}

export async function DELETE(request: Request) {
  const isAdmin = isAdminRequest(request)
  if (!isAdmin) return NextResponse.json({ error: "Admin access is required." }, { status: 401 })

  const url = new URL(request.url)
  const requestId = String(url.searchParams.get("requestId") || "")
  if (!requestId) return NextResponse.json({ error: "Request id is required." }, { status: 400 })

  const stored = await readJerseyRequests()
  if (stored.error) return NextResponse.json({ error: stored.error }, { status: 500 })

  const nextRequests = stored.requests.filter((request) => request.id !== requestId)
  if (nextRequests.length === stored.requests.length) return NextResponse.json({ error: "Request not found." }, { status: 404 })

  const saved = await saveJerseyRequests(nextRequests)
  if (saved.error) return NextResponse.json({ error: saved.error }, { status: 500 })

  return NextResponse.json({ ok: true })
}

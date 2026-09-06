import { NextResponse } from "next/server"
import { adminSupportNotificationEmailHtml, customerSupportUpdateEmailHtml, sendEmail } from "@/lib/email"
import { readSupportTickets, saveSupportTickets } from "@/lib/support-storage"
import { createSupportTicketId, type SupportAttachment, type SupportMessage, type SupportTicket } from "@/lib/support"

export const runtime = "nodejs"

const ADMIN_COOKIE = "terrace_admin"
const ADMIN_NOTIFICATION_EMAIL = "terrace.fc@terracefc.com"
const MAX_ATTACHMENTS = 3
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024

export async function GET(request: Request) {
  const url = new URL(request.url)
  const ticketId = String(url.searchParams.get("ticketId") || "")
  const customerEmail = String(url.searchParams.get("email") || "").trim().toLowerCase()
  const isAdmin = getCookie(request, ADMIN_COOKIE) === (process.env.ADMIN_SESSION_TOKEN || "terrace-admin-session")

  const stored = await readSupportTickets()
  if (stored.error) return NextResponse.json({ error: stored.error }, { status: 500 })

  if (isAdmin) return NextResponse.json({ tickets: stored.tickets })

  if (!customerEmail) {
    return NextResponse.json({ tickets: [] })
  }

  const tickets = stored.tickets.filter((ticket) => {
    if (ticket.customerEmail.toLowerCase() !== customerEmail) return false
    if (ticketId) return ticket.id === ticketId
    return true
  })

  return NextResponse.json({ tickets })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const name = String(body?.name || "").trim()
  const email = String(body?.email || "").trim().toLowerCase()
  const subject = String(body?.subject || "").trim()
  const text = String(body?.message || "").trim()
  const attachments = normalizeAttachments(body?.attachments)

  if (!name || !email || !subject || !text) {
    return NextResponse.json({ error: "Name, email, subject, and message are required." }, { status: 400 })
  }

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 })
  }

  const stored = await readSupportTickets()
  if (stored.error) return NextResponse.json({ error: stored.error }, { status: 500 })

  const now = new Date().toISOString()
  const ticket: SupportTicket = {
    id: createSupportTicketId(),
    customerName: name,
    customerEmail: email,
    subject,
    status: "open",
    createdAt: now,
    updatedAt: now,
    messages: [{
      id: crypto.randomUUID(),
      sender: "customer",
      senderName: name,
      text,
      createdAt: now,
      attachments,
    }],
  }

  const saved = await saveSupportTickets([ticket, ...stored.tickets])
  if (saved.error) return NextResponse.json({ error: saved.error }, { status: 500 })

  await sendAdminSupportNotification(ticket, text, attachments.length)

  return NextResponse.json({ ticket })
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null)
  const ticketId = String(body?.ticketId || "")
  const sender = body?.sender === "admin" ? "admin" : "customer"
  const customerEmail = String(body?.email || "").trim().toLowerCase()
  const text = String(body?.message || "").trim()
  const nextStatus = body?.status === "closed" || body?.status === "open" ? body.status : undefined
  const isAdmin = getCookie(request, ADMIN_COOKIE) === (process.env.ADMIN_SESSION_TOKEN || "terrace-admin-session")
  const attachments = normalizeAttachments(body?.attachments)

  if (!ticketId) return NextResponse.json({ error: "Ticket id is required." }, { status: 400 })
  if (sender === "admin" && !isAdmin) return NextResponse.json({ error: "Admin access is required." }, { status: 401 })
  if (sender === "customer" && !customerEmail) return NextResponse.json({ error: "Customer email is required." }, { status: 400 })
  if (!text && !nextStatus) return NextResponse.json({ error: "Message or status is required." }, { status: 400 })

  const stored = await readSupportTickets()
  if (stored.error) return NextResponse.json({ error: stored.error }, { status: 500 })

  const now = new Date().toISOString()
  const targetTicket = stored.tickets.find((ticket) => ticket.id === ticketId)
  if (!targetTicket) return NextResponse.json({ error: "Ticket not found." }, { status: 404 })
  if (sender === "customer" && targetTicket.customerEmail.toLowerCase() !== customerEmail) {
    return NextResponse.json({ error: "Support chat not found." }, { status: 404 })
  }

  const tickets = stored.tickets.map((ticket) => {
    if (ticket.id !== ticketId) return ticket

    const nextMessages = text ? [
      ...ticket.messages,
      {
        id: crypto.randomUUID(),
        sender,
        senderName: sender === "admin" ? "terrace.fc Support" : ticket.customerName,
        text,
        createdAt: now,
        attachments,
      } satisfies SupportMessage,
    ] : ticket.messages

    return {
      ...ticket,
      status: nextStatus || ticket.status,
      updatedAt: now,
      messages: nextMessages,
    }
  })
  const updatedTicket = tickets.find((ticket) => ticket.id === ticketId)

  if (!updatedTicket) return NextResponse.json({ error: "Ticket not found." }, { status: 404 })

  const saved = await saveSupportTickets(tickets)
  if (saved.error) return NextResponse.json({ error: saved.error }, { status: 500 })

  if (sender === "customer" && text) {
    await sendAdminSupportNotification(updatedTicket, text, attachments.length)
  }

  if (sender === "admin") {
    const result = await sendEmail({
      to: updatedTicket.customerEmail,
      subject: `terrace.fc support update - ${updatedTicket.id}`,
      html: customerSupportUpdateEmailHtml(updatedTicket, text || undefined),
    })
    if (!result.sent) {
      console.warn(`Customer support update email not sent for ${updatedTicket.id}: ${result.reason || "unknown reason"}`)
    }
  }

  return NextResponse.json({ ticket: updatedTicket })
}

export async function DELETE(request: Request) {
  const isAdmin = getCookie(request, ADMIN_COOKIE) === (process.env.ADMIN_SESSION_TOKEN || "terrace-admin-session")
  if (!isAdmin) return NextResponse.json({ error: "Admin access is required." }, { status: 401 })

  const url = new URL(request.url)
  const ticketId = String(url.searchParams.get("ticketId") || "")
  if (!ticketId) return NextResponse.json({ error: "Ticket id is required." }, { status: 400 })

  const stored = await readSupportTickets()
  if (stored.error) return NextResponse.json({ error: stored.error }, { status: 500 })

  const nextTickets = stored.tickets.filter((ticket) => ticket.id !== ticketId)
  if (nextTickets.length === stored.tickets.length) return NextResponse.json({ error: "Ticket not found." }, { status: 404 })

  const saved = await saveSupportTickets(nextTickets)
  if (saved.error) return NextResponse.json({ error: saved.error }, { status: 500 })

  return NextResponse.json({ ok: true })
}

async function sendAdminSupportNotification(ticket: SupportTicket, message: string, attachmentCount: number) {
  const result = await sendEmail({
    to: ADMIN_NOTIFICATION_EMAIL,
    subject: `New terrace.fc support message - ${ticket.id}`,
    html: adminSupportNotificationEmailHtml({
      ticketId: ticket.id,
      customerName: ticket.customerName,
      customerEmail: ticket.customerEmail,
      subject: ticket.subject,
      message,
      attachmentCount,
    }),
  })

  if (!result.sent) {
    console.warn(`Support notification email not sent for ${ticket.id}: ${result.reason || "unknown reason"}`)
  }
}

function normalizeAttachments(value: unknown): SupportAttachment[] {
  if (!Array.isArray(value)) return []

  return value.slice(0, MAX_ATTACHMENTS).filter((attachment): attachment is SupportAttachment => {
    if (!attachment || typeof attachment !== "object") return false
    const item = attachment as Partial<SupportAttachment>
    return (
      typeof item.name === "string" &&
      typeof item.type === "string" &&
      typeof item.dataUrl === "string" &&
      Number.isFinite(Number(item.size)) &&
      Number(item.size) <= MAX_ATTACHMENT_BYTES
    )
  }).map((attachment) => ({
    id: attachment.id || crypto.randomUUID(),
    name: attachment.name,
    type: attachment.type,
    size: Number(attachment.size),
    dataUrl: attachment.dataUrl,
  }))
}

function getCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") || ""
  const match = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : ""
}

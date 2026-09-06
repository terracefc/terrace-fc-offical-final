export type SupportAttachment = {
  id: string
  name: string
  type: string
  size: number
  dataUrl: string
}

export type SupportMessage = {
  id: string
  sender: "customer" | "admin"
  senderName: string
  text: string
  createdAt: string
  attachments?: SupportAttachment[]
}

export type SupportTicket = {
  id: string
  customerName: string
  customerEmail: string
  subject: string
  status: "open" | "closed"
  createdAt: string
  updatedAt: string
  messages: SupportMessage[]
}

export function createSupportTicketId() {
  return `HELP-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${Math.floor(1000 + Math.random() * 9000)}`
}

export function normalizeSupportTickets(value: unknown): SupportTicket[] {
  if (!Array.isArray(value)) return []

  return value.filter((ticket): ticket is SupportTicket => {
    return !!ticket && typeof ticket === "object" && typeof (ticket as SupportTicket).id === "string"
  }).map((ticket) => ({
    ...ticket,
    status: ticket.status === "closed" ? "closed" : "open",
    messages: Array.isArray(ticket.messages) ? ticket.messages : [],
  }))
}

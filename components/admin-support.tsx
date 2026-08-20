"use client"

import { useEffect, useState } from "react"
import { Loader2, MessageCircle, Paperclip, Send, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { SupportAttachment, SupportTicket } from "@/lib/support"

export function AdminSupport() {
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [activeTicketId, setActiveTicketId] = useState("")
  const [reply, setReply] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    loadTickets()
    const syncTickets = () => loadTickets()
    const interval = window.setInterval(() => {
      if (!isSaving) loadTickets({ quiet: true })
    }, 8000)
    window.addEventListener("focus", syncTickets)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener("focus", syncTickets)
    }
  }, [])

  const activeTicket = tickets.find((ticket) => ticket.id === activeTicketId) || tickets[0]
  const openCount = tickets.filter((ticket) => ticket.status === "open").length

  async function loadTickets(options: { quiet?: boolean } = {}) {
    if (!options.quiet) setIsLoading(true)
    try {
      const response = await fetch("/api/support", { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Could not load support chats.")
      const nextTickets = Array.isArray(data.tickets) ? data.tickets : []
      setTickets(nextTickets)
      setActiveTicketId((current) => current || nextTickets[0]?.id || "")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load support chats.")
    } finally {
      if (!options.quiet) setIsLoading(false)
    }
  }

  async function sendReply() {
    if (!activeTicket || !reply.trim()) return
    setIsSaving(true)
    setMessage("")
    try {
      const response = await fetch("/api/support", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: activeTicket.id, sender: "admin", message: reply }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Could not send reply.")
      setTickets((current) => current.map((ticket) => ticket.id === activeTicket.id ? data.ticket : ticket))
      setReply("")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send reply.")
    } finally {
      setIsSaving(false)
    }
  }

  async function setTicketStatus(status: SupportTicket["status"]) {
    if (!activeTicket) return
    setIsSaving(true)
    setMessage("")
    try {
      const response = await fetch("/api/support", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: activeTicket.id, sender: "admin", status }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Could not update status.")
      setTickets((current) => current.map((ticket) => ticket.id === activeTicket.id ? data.ticket : ticket))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update status.")
    } finally {
      setIsSaving(false)
    }
  }

  async function deleteTicket(ticketId: string) {
    if (!window.confirm("Delete this support chat?")) return
    setIsSaving(true)
    setMessage("")
    try {
      const response = await fetch(`/api/support?ticketId=${encodeURIComponent(ticketId)}`, { method: "DELETE" })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || "Could not delete support chat.")
      setTickets((current) => current.filter((ticket) => ticket.id !== ticketId))
      setActiveTicketId((current) => current === ticketId ? "" : current)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete support chat.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-background/85 p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-accent" />
          <h2 className="text-xl font-black tracking-tight">Support Chats</h2>
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-black text-accent">{openCount} open</span>
        </div>
        <Button type="button" variant="outline" onClick={() => loadTickets()} disabled={isLoading}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Refresh
        </Button>
      </div>

      {message && <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm font-bold text-red-500">{message}</div>}

      {isLoading ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Loading support chats...</div>
      ) : tickets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No support chats yet.</div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
          <div className="space-y-2">
            {tickets.map((ticket) => (
              <button
                key={ticket.id}
                type="button"
                onClick={() => setActiveTicketId(ticket.id)}
                className={`w-full rounded-xl border p-3 text-left transition-colors ${activeTicket?.id === ticket.id ? "border-accent bg-accent/10" : "border-border hover:bg-secondary/30"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-black">{ticket.subject}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${ticket.status === "open" ? "bg-emerald-500/10 text-emerald-600" : "bg-secondary text-muted-foreground"}`}>
                    {ticket.status}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">{ticket.customerName} - {ticket.customerEmail}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{new Date(ticket.updatedAt).toLocaleString("en-IN")}</p>
              </button>
            ))}
          </div>

          {activeTicket && (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{activeTicket.id}</p>
                  <h3 className="text-2xl font-black tracking-tight">{activeTicket.subject}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{activeTicket.customerName} - {activeTicket.customerEmail}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" disabled={isSaving} onClick={() => setTicketStatus(activeTicket.status === "open" ? "closed" : "open")}>
                    {activeTicket.status === "open" ? "Close Chat" : "Reopen Chat"}
                  </Button>
                  <Button type="button" variant="outline" disabled={isSaving} onClick={() => deleteTicket(activeTicket.id)} className="border-red-500/30 text-red-500 hover:bg-red-500/10">
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </div>

              <div className="max-h-[520px] space-y-3 overflow-y-auto rounded-xl border border-border bg-secondary/10 p-3">
                {activeTicket.messages.map((chat) => (
                  <div key={chat.id} className={`rounded-xl border p-3 text-sm ${chat.sender === "admin" ? "border-accent/30 bg-accent/10" : "border-border bg-background"}`}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="font-black">{chat.senderName}</p>
                      <p className="text-[10px] text-muted-foreground">{new Date(chat.createdAt).toLocaleString("en-IN")}</p>
                    </div>
                    <p className="whitespace-pre-wrap text-muted-foreground">{chat.text}</p>
                    <AttachmentLinks attachments={chat.attachments} />
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <textarea
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault()
                      sendReply()
                    }
                  }}
                  placeholder="Reply to customer..."
                  className="min-h-16 flex-1 rounded-xl border border-border bg-secondary/30 p-3 text-sm outline-none focus:border-accent"
                />
                <Button type="button" onClick={sendReply} disabled={isSaving || !reply.trim() || activeTicket.status === "closed"} className="bg-foreground text-background sm:w-36">
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Reply
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AttachmentLinks({ attachments }: { attachments?: SupportAttachment[] }) {
  if (!attachments?.length) return null
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {attachments.map((attachment) => (
        <a
          key={attachment.id}
          href={attachment.dataUrl}
          download={attachment.name}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-bold text-accent hover:bg-secondary"
        >
          <Paperclip className="h-3 w-3" />
          {attachment.name}
        </a>
      ))}
    </div>
  )
}

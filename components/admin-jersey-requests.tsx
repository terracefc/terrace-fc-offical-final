"use client"

import { useEffect, useState } from "react"
import { Loader2, Send, Shirt, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { JerseyRequest } from "@/lib/jersey-requests"

export function AdminJerseyRequests() {
  const [requests, setRequests] = useState<JerseyRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState("")
  const [message, setMessage] = useState("")
  const [replies, setReplies] = useState<Record<string, string>>({})

  useEffect(() => {
    loadRequests()
    const syncRequests = () => loadRequests()
    const interval = window.setInterval(() => loadRequests({ quiet: true }), 15000)
    window.addEventListener("focus", syncRequests)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener("focus", syncRequests)
    }
  }, [])

  async function loadRequests(options: { quiet?: boolean } = {}) {
    if (!options.quiet) {
      setIsLoading(true)
      setMessage("")
    }
    try {
      const response = await fetch("/api/jersey-requests", { cache: "no-store", credentials: "include" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Could not load jersey requests.")
      setRequests(Array.isArray(data.requests) ? data.requests : [])
    } catch (error) {
      if (!options.quiet) setMessage(error instanceof Error ? error.message : "Could not load jersey requests.")
    } finally {
      if (!options.quiet) setIsLoading(false)
    }
  }

  async function updateStatus(requestId: string, status: JerseyRequest["status"]) {
    setIsSaving(requestId)
    setMessage("")
    try {
      const response = await fetch("/api/jersey-requests", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, status }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Could not update request.")
      setRequests((current) => current.map((request) => request.id === requestId ? data.request : request))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update request.")
    } finally {
      setIsSaving("")
    }
  }

  async function sendReply(requestId: string) {
    const reply = (replies[requestId] || "").trim()
    if (!reply) return
    setIsSaving(requestId)
    setMessage("")
    try {
      const response = await fetch("/api/jersey-requests", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, sender: "admin", message: reply }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(response.status === 401 ? "Admin session expired. Please log in again, then send the reply." : data.error || "Could not send reply.")
      setRequests((current) => current.map((request) => request.id === requestId ? data.request : request))
      setReplies((current) => ({ ...current, [requestId]: "" }))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send reply.")
    } finally {
      setIsSaving("")
    }
  }

  async function deleteRequest(requestId: string) {
    if (!window.confirm("Delete this jersey request?")) return
    setIsSaving(requestId)
    setMessage("")
    try {
      const response = await fetch(`/api/jersey-requests?requestId=${encodeURIComponent(requestId)}`, { method: "DELETE", credentials: "include" })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || "Could not delete request.")
      setRequests((current) => current.filter((request) => request.id !== requestId))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete request.")
    } finally {
      setIsSaving("")
    }
  }

  const newCount = requests.filter((request) => request.status === "new").length

  return (
    <div className="rounded-2xl border border-border bg-background/85 p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Shirt className="h-5 w-5 text-accent" />
          <h2 className="text-xl font-black tracking-tight">Jersey Requests</h2>
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-black text-accent">{newCount} new</span>
        </div>
        <Button type="button" variant="outline" onClick={() => loadRequests()} disabled={isLoading}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Refresh
        </Button>
      </div>

      {message && <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm font-bold text-red-500">{message}</div>}

      {isLoading ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Loading requests...</div>
      ) : requests.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No jersey requests yet.</div>
      ) : (
        <div className="grid gap-3">
          {requests.map((request) => (
            <article key={request.id} className="rounded-xl border border-border bg-background p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{request.id}</p>
                  <h3 className="mt-1 text-lg font-black">{request.clubOrCountry} - {request.playerName}</h3>
                  <p className="text-sm text-muted-foreground">{request.year}{request.number ? ` - ${request.number}` : ""}</p>
                </div>
                <span className={`w-fit rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${request.status === "new" ? "bg-accent/10 text-accent" : request.status === "reviewed" ? "bg-blue-500/10 text-blue-600" : "bg-emerald-500/10 text-emerald-600"}`}>
                  {request.status}
                </span>
              </div>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <p><span className="font-black">Customer:</span> {request.name}</p>
                <p><span className="font-black">Email:</span> {request.email}</p>
              </div>
              {request.notes && <p className="mt-3 rounded-lg border border-border bg-secondary/20 p-3 text-sm text-muted-foreground">{request.notes}</p>}
              {request.photo?.dataUrl && (
                <a href={request.photo.dataUrl} target="_blank" rel="noreferrer" className="mt-3 block w-fit rounded-xl border border-border bg-secondary/20 p-2 hover:bg-secondary/40">
                  <img src={request.photo.dataUrl} alt={request.photo.name || "Requested jersey reference"} className="h-36 w-36 rounded-lg object-cover" />
                  <p className="mt-2 max-w-36 truncate text-xs font-bold text-muted-foreground">{request.photo.name}</p>
                </a>
              )}
              <div className="mt-4 rounded-xl border border-border bg-secondary/10 p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Request Chat</p>
                {(request.messages || []).length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">No messages yet.</p>
                ) : (
                  <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
                    {(request.messages || []).map((chat) => (
                      <div key={chat.id} className={`rounded-lg border p-2 text-sm ${chat.sender === "admin" ? "border-accent/30 bg-accent/10" : "border-border bg-background"}`}>
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <p className="font-black">{chat.senderName}</p>
                          <p className="text-[10px] text-muted-foreground">{new Date(chat.createdAt).toLocaleString("en-IN")}</p>
                        </div>
                        <p className="whitespace-pre-wrap text-muted-foreground">{chat.text}</p>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    value={replies[request.id] || ""}
                    onChange={(event) => setReplies((current) => ({ ...current, [request.id]: event.target.value }))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault()
                        sendReply(request.id)
                      }
                    }}
                    placeholder="Reply to customer..."
                    className="h-10 flex-1 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-accent"
                  />
                  <Button type="button" onClick={() => sendReply(request.id)} disabled={isSaving === request.id || !(replies[request.id] || "").trim()} className="bg-foreground text-background">
                    <Send className="h-4 w-4" />
                    Reply
                  </Button>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" variant="outline" disabled={isSaving === request.id} onClick={() => updateStatus(request.id, "reviewed")}>
                  Mark Reviewed
                </Button>
                <Button type="button" className="bg-foreground text-background" disabled={isSaving === request.id} onClick={() => updateStatus(request.id, "done")}>
                  Mark Done
                </Button>
                <Button type="button" variant="outline" disabled={isSaving === request.id} onClick={() => updateStatus(request.id, "new")}>
                  Back To New
                </Button>
                <Button type="button" variant="outline" disabled={isSaving === request.id} onClick={() => deleteRequest(request.id)} className="border-red-500/30 text-red-500 hover:bg-red-500/10">
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

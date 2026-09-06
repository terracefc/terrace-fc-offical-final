"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ClipboardList, Instagram, Loader2, MessageCircle, PackageCheck, Send, Shirt, ShoppingBag, UserRound, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { clearCustomer, readCustomer, saveCustomer, type CustomerAccount } from "@/lib/customer-auth"
import { fetchOrders, getOrderDisplayId, isCancelledOrderExpired, readOrders, type StoreOrder } from "@/lib/orders"
import { getJerseyBackLabel, getJerseyVersionLabel, isCustomBack } from "@/lib/store-context"
import { isRetroJersey } from "@/lib/pricing"
import { getCourierTrackingUrl, getOrderStatusLabel as getFulfillmentStatusLabel } from "@/lib/tracking"
import type { JerseyRequest } from "@/lib/jersey-requests"
import type { SupportTicket } from "@/lib/support"
import { confirmAction } from "@/lib/confirm-action"

type ProfileTab = "account" | "orders" | "support" | "requests"
const INSTAGRAM_URL = "https://www.instagram.com/terrace.fc_/"

export default function ProfilePage() {
  const [customer, setCustomer] = useState<CustomerAccount | null>(null)
  const [isCustomerLoading, setIsCustomerLoading] = useState(true)
  const [orders, setOrders] = useState<StoreOrder[]>([])
  const [activeTab, setActiveTab] = useState<ProfileTab>("account")

  useEffect(() => {
    const storedCustomer = readCustomer()
    setCustomer(storedCustomer)
    setIsCustomerLoading(false)
    setOrders(readOrders())
    fetchOrders().then(setOrders).catch(() => null)
    const tab = new URLSearchParams(window.location.search).get("tab")
    if (tab === "orders" || tab === "support" || tab === "requests" || tab === "account") setActiveTab(tab)
  }, [])

  useEffect(() => {
    if (!customer) return
    const refreshOrders = () => fetchOrders().then(setOrders).catch(() => null)
    refreshOrders()
    const interval = window.setInterval(refreshOrders, 15_000)
    window.addEventListener("focus", refreshOrders)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener("focus", refreshOrders)
    }
  }, [customer])

  const customerOrders = useMemo(() => {
    if (!customer) return []
    return orders.filter((order) => {
      const matchesCustomer = order.customerId === customer.id || (order.customerEmail || "").toLowerCase() === customer.email.toLowerCase()
      return matchesCustomer && order.fulfillmentStatus !== "cancelled"
    })
  }, [customer, orders])

  return (
    <main className="dark min-h-screen bg-[#080506] text-white noise-texture">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_right,rgba(220,38,38,0.14),transparent_34%),linear-gradient(180deg,rgba(127,29,29,0.12),transparent_42%)]" />
      <div className="border-b border-white/10 bg-black/85 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="font-black tracking-tight text-xl hover:text-accent transition-colors">
            terrace<span className="text-accent">.</span>fc
          </Link>
          <Button asChild variant="outline" size="sm" className="border-white/15 bg-white/5 text-white hover:bg-red-600 hover:text-white">
            <Link href="/collection">Shop</Link>
          </Button>
        </div>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-accent">Customer Profile</p>
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight mt-2">Your Account</h1>
          </div>
        </div>

        {isCustomerLoading ? (
          <div className="max-w-xl rounded-2xl border border-white/10 bg-black/65 p-8 text-center shadow-2xl shadow-black/35">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-red-300" />
            <p className="mt-3 text-xs font-black uppercase tracking-widest text-white/55">Loading profile</p>
          </div>
        ) : !customer ? (
          <div className="max-w-xl rounded-2xl border border-white/10 bg-black/65 p-5 shadow-2xl shadow-black/35 sm:p-6">
            <h2 className="font-black text-xl tracking-tight">Login Required</h2>
            <p className="mt-1 text-sm text-muted-foreground">Login to access your profile, orders, and account details.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Button asChild className="h-12 bg-red-600 text-white font-black uppercase tracking-wider hover:bg-white hover:text-black">
                <Link href="/login">Login</Link>
              </Button>
              <Button asChild variant="outline" className="h-12 border-white/15 bg-white/5 text-white font-black uppercase tracking-wider hover:bg-red-600 hover:text-white">
                <Link href="/signup">Sign Up</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/65 p-4 shadow-2xl shadow-black/25 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-red-300">Signed in</p>
                <p className="mt-1 text-sm font-bold text-white/70">{customer.email}</p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await fetch("/api/auth/google/logout", { method: "POST", credentials: "same-origin", cache: "no-store" }).catch(() => null)
                  clearCustomer()
                  window.location.replace("/")
                }}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 text-xs font-black uppercase tracking-widest text-white hover:bg-red-600"
              >
                Logout
              </button>
            </div>
            <AccountPanel
              customer={customer}
              orders={customerOrders}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onCustomerChange={(nextCustomer) => {
                saveCustomer(nextCustomer)
                setCustomer(nextCustomer)
              }}
            />
          </div>
        )}
      </div>
    </main>
  )
}

function OrdersPanel({ customerEmail, orders }: { customerEmail: string; orders: StoreOrder[] }) {
  const [localOrders, setLocalOrders] = useState(orders)
  const [now, setNow] = useState(Date.now())
  const [cancellationReasons, setCancellationReasons] = useState<Record<string, string>>({})
  const [cancellationMessages, setCancellationMessages] = useState<Record<string, string>>({})
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null)

  useEffect(() => {
    setLocalOrders(orders)
  }, [orders])

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  const visibleOrders = useMemo(() => {
    return localOrders.filter((order) => !isCancelledOrderExpired(order, now))
  }, [localOrders, now])

  const requestCancellation = async (order: StoreOrder) => {
    const reason = (cancellationReasons[order.id] || "").trim() || "Customer requested cancellation"

    if (!canRequestCancellation(order, now)) {
      setCancellationMessages((current) => ({ ...current, [order.id]: "This order can no longer be cancelled online. Please contact support for help." }))
      return
    }

    if (!(await confirmAction(`Send a cancellation request for ${getOrderDisplayId(order)}? Our team will review it before cancelling the order.`))) return

    setCancellingOrderId(order.id)
    setCancellationMessages((current) => ({ ...current, [order.id]: "" }))
    const requestedAt = new Date().toISOString()

    try {
      const response = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          customerEmail,
          updates: {
            cancellationBy: "customer",
            cancellationNote: reason,
            cancellationRequestedAt: requestedAt,
          },
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || "Could not send the cancellation request.")

      setLocalOrders((current) => current.map((item) => item.id === order.id ? {
        ...item,
        cancellationBy: "customer",
        cancellationNote: reason,
        cancellationRequestedAt: requestedAt,
      } : item))
      setCancellationMessages((current) => ({ ...current, [order.id]: "Cancellation request sent. We will review it before taking any action." }))
    } catch (error) {
      setCancellationMessages((current) => ({ ...current, [order.id]: error instanceof Error ? error.message : "Could not send the cancellation request." }))
    } finally {
      setCancellingOrderId(null)
    }
  }

  if (visibleOrders.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-background/85 p-8 text-center">
        <ShoppingBag className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
        <h2 className="font-black text-xl">No orders yet</h2>
        <p className="text-sm text-muted-foreground mt-1">Orders placed from this account will appear here with their order number.</p>
        <Button asChild className="mt-5 bg-foreground text-background">
          <Link href="/collection">Shop jerseys</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {visibleOrders.map((order) => (
        <article key={order.id} className="rounded-2xl border border-border bg-background/85 p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Order Number</p>
              <h2 className="text-2xl font-black tracking-tight">{getOrderDisplayId(order)}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{new Date(order.createdAt).toLocaleString("en-IN")}</p>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-black uppercase tracking-widest text-emerald-600">
              <PackageCheck className="w-4 h-4" />
              {getOrderStatusLabel(order.status)}
            </span>
          </div>

          <div className="mt-4 rounded-xl border border-border/60 bg-secondary/20 p-3 text-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Order Status</p>
            <p className="mt-1 font-black">{getFulfillmentLabel(order.fulfillmentStatus)}</p>
            {(order.trackingNumber || order.shippingId) && (
              <p className="mt-1 text-xs text-muted-foreground">
                Tracking: <span className="font-black text-foreground">{order.trackingNumber || order.shippingId}</span>
              </p>
            )}
            {order.courierName && (
              <p className="mt-1 text-xs text-muted-foreground">
                Courier: <span className="font-black text-foreground">{order.courierName}</span>
              </p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orders/${order.id}`}>View Order</Link>
            </Button>
            {getCourierTrackingUrl(order.courierName, order.trackingNumber || order.shippingId) && (
              <Button asChild className="bg-foreground text-background">
                <a href={getCourierTrackingUrl(order.courierName, order.trackingNumber || order.shippingId) || "#"} target="_blank" rel="noreferrer">
                  Track Shipment
                </a>
              </Button>
            )}
          </div>

          {order.cancellationRequestedAt ? (
            <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs font-bold text-amber-700 dark:text-amber-300">
              Cancellation requested on {new Date(order.cancellationRequestedAt).toLocaleString("en-IN")}. We will review it before cancelling the order.
            </p>
          ) : canRequestCancellation(order, now) ? (
            <div className="mt-4 rounded-xl border border-border/70 bg-secondary/20 p-3">
              <p className="text-xs font-black">Need to cancel this order?</p>
              <p className="mt-1 text-xs text-muted-foreground">Requests are available for the first 24 hours, before the order is handed to the courier.</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  value={cancellationReasons[order.id] || ""}
                  onChange={(event) => setCancellationReasons((current) => ({ ...current, [order.id]: event.target.value }))}
                  placeholder="Reason for cancellation"
                  className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent"
                />
                <Button type="button" variant="outline" onClick={() => requestCancellation(order)} disabled={cancellingOrderId === order.id}>
                  {cancellingOrderId === order.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                  Request cancellation
                </Button>
              </div>
              {cancellationMessages[order.id] && <p className="mt-2 text-xs font-bold text-muted-foreground">{cancellationMessages[order.id]}</p>}
            </div>
          ) : null}

          <div className="mt-5 space-y-2">
            {order.items.map((item) => {
              const customization = normalizeCustomization(item.customization)
              const isRetroProduct = isRetroJersey({ name: item.name, season: item.season, badge: "", productType: "" })
              return (
              <div key={`${order.id}-${item.id}-${item.size}-${item.version || "plain"}-${customization.name}-${customization.number}`} className="flex justify-between gap-3 text-sm">
                <span>
                  {item.name} - {item.club} - Size {item.size}
                  {!isRetroProduct && <> - {getJerseyVersionLabel(item.version)}{item.version !== "embroidery" ? ` - ${isCustomBack(customization) ? `Name: ${customization.name.trim() || "Name"}, Number: ${customization.number.trim() || "00"}` : getJerseyBackLabel(customization)}` : ""}</>} x{item.quantity}
                </span>
                <span className="font-black">₹{(item.price * item.quantity).toLocaleString("en-IN")}</span>
              </div>
              )
            })}
          </div>

          <div className="mt-5 border-t border-border pt-4 space-y-1.5">
            {(order.discount || 0) > 0 ? (
              <>
                <div className="flex justify-between text-xs text-muted-foreground font-bold">
                  <span>Subtotal</span>
                  <span>₹{order.subtotal.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between text-xs text-emerald-500 font-bold">
                  <span>Discount ({order.couponCode || "Coupon"})</span>
                  <span>-₹{(order.discount || 0).toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground font-bold">
                  <span>Delivery</span>
                  <span>{order.deliveryCharge === 0 ? "FREE" : `₹${order.deliveryCharge}`}</span>
                </div>
                <div className="border-t border-border/40 my-1" />
              </>
            ) : null}
            <div className="flex justify-between font-black">
              <span>Total</span>
              <span className="text-accent">₹{order.total.toLocaleString("en-IN")}</span>
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}

function SupportPanel({ customer }: { customer: CustomerAccount }) {
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [message, setMessage] = useState("")

  useEffect(() => {
    let isMounted = true
    async function loadTickets() {
      setIsLoading(true)
      setMessage("")
      try {
        const response = await fetch(`/api/support?email=${encodeURIComponent(customer.email)}`, { cache: "no-store" })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "Could not load support chats.")
        if (isMounted) setTickets(Array.isArray(data.tickets) ? data.tickets : [])
      } catch (error) {
        if (isMounted) setMessage(error instanceof Error ? error.message : "Could not load support chats.")
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }
    loadTickets()
    return () => {
      isMounted = false
    }
  }, [customer.email])

  return (
    <section className="rounded-2xl border border-border bg-background/85 p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-black text-xl tracking-tight">Support Chats</h2>
          <p className="mt-1 text-sm text-muted-foreground">Check replies and status updates for problems you submitted.</p>
        </div>
        <Button asChild className="bg-foreground text-background">
          <Link href="/support">Open Support</Link>
        </Button>
      </div>
      {message && <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm font-bold text-red-500">{message}</div>}
      {isLoading ? (
        <div className="mt-5 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Loading support chats...</div>
      ) : tickets.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No support chats yet.</div>
      ) : (
        <div className="mt-5 grid gap-3">
          {tickets.map((ticket) => {
            const lastMessage = ticket.messages[ticket.messages.length - 1]
            return (
              <article key={ticket.id} className="rounded-xl border border-border bg-background p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{ticket.id}</p>
                    <h3 className="mt-1 text-lg font-black">{ticket.subject}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">Updated {new Date(ticket.updatedAt).toLocaleString("en-IN")}</p>
                  </div>
                  <span className={`w-fit rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${ticket.status === "open" ? "bg-emerald-500/10 text-emerald-600" : "bg-secondary text-muted-foreground"}`}>
                    {ticket.status}
                  </span>
                </div>
                {lastMessage && (
                  <p className="mt-3 rounded-lg border border-border/60 bg-secondary/20 p-3 text-sm text-muted-foreground">
                    <span className="font-black text-foreground">{lastMessage.senderName}:</span> {lastMessage.text}
                  </p>
                )}
                <Button asChild variant="outline" className="mt-4">
                  <Link href="/support">View Chat</Link>
                </Button>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

function JerseyRequestsPanel({ customer }: { customer: CustomerAccount }) {
  const [requests, setRequests] = useState<JerseyRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState("")
  const [message, setMessage] = useState("")
  const [replies, setReplies] = useState<Record<string, string>>({})

  const loadRequests = async (options: { quiet?: boolean } = {}) => {
    let isMounted = true
    if (!options.quiet) {
      setIsLoading(true)
      setMessage("")
    }
    try {
      const response = await fetch(`/api/jersey-requests?email=${encodeURIComponent(customer.email)}`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Could not load jersey requests.")
      if (isMounted) setRequests(Array.isArray(data.requests) ? data.requests : [])
    } catch (error) {
      if (isMounted && !options.quiet) setMessage(error instanceof Error ? error.message : "Could not load jersey requests.")
    } finally {
      if (isMounted && !options.quiet) setIsLoading(false)
    }
    return () => {
      isMounted = false
    }
  }

  useEffect(() => {
    loadRequests()
    const interval = window.setInterval(() => loadRequests({ quiet: true }), 12000)
    return () => {
      window.clearInterval(interval)
    }
  }, [customer.email])

  async function sendRequestMessage(requestId: string) {
    const reply = (replies[requestId] || "").trim()
    if (!reply) return
    setIsSending(requestId)
    setMessage("")
    try {
      const response = await fetch("/api/jersey-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, sender: "customer", email: customer.email, message: reply }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Could not send message.")
      setRequests((current) => current.map((request) => request.id === requestId ? data.request : request))
      setReplies((current) => ({ ...current, [requestId]: "" }))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send message.")
    } finally {
      setIsSending("")
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-background/85 p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-black text-xl tracking-tight">Requested Jerseys</h2>
          <p className="mt-1 text-sm text-muted-foreground">Track jerseys you asked terrace.fc to bring.</p>
        </div>
        <Button asChild className="bg-foreground text-background">
          <Link href="/request-jersey">Request Jersey</Link>
        </Button>
      </div>
      {message && <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm font-bold text-red-500">{message}</div>}
      {isLoading ? (
        <div className="mt-5 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Loading jersey requests...</div>
      ) : requests.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No jersey requests yet.</div>
      ) : (
        <div className="mt-5 grid gap-3">
          {requests.map((request) => (
            <article key={request.id} className="rounded-xl border border-border bg-background p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{request.id}</p>
                  <h3 className="mt-1 text-lg font-black">{request.clubOrCountry} - {request.playerName}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{request.year}{request.number ? ` - ${request.number}` : ""}</p>
                </div>
                <span className={`w-fit rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${request.status === "new" ? "bg-accent/10 text-accent" : request.status === "reviewed" ? "bg-blue-500/10 text-blue-600" : "bg-emerald-500/10 text-emerald-600"}`}>
                  {request.status === "new" ? "Received" : request.status}
                </span>
              </div>
              {request.notes && <p className="mt-3 rounded-lg border border-border/60 bg-secondary/20 p-3 text-sm text-muted-foreground">{request.notes}</p>}
              {request.photo.dataUrl && (
                <a href={request.photo.dataUrl} target="_blank" rel="noreferrer" className="mt-3 block w-fit rounded-xl border border-border bg-secondary/20 p-2 hover:bg-secondary/40">
                  <img src={request.photo.dataUrl} alt={request.photo.name || "Requested jersey reference"} className="h-28 w-28 rounded-lg object-cover" />
                  <p className="mt-2 max-w-28 truncate text-xs font-bold text-muted-foreground">{request.photo.name}</p>
                </a>
              )}
              <p className="mt-3 text-xs text-muted-foreground">Updated {new Date(request.updatedAt).toLocaleString("en-IN")}</p>
              <div className="mt-4 rounded-xl border border-border bg-secondary/10 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Request Chat</p>
                  <Button asChild variant="outline" className="h-9 w-full text-xs font-black uppercase tracking-wider sm:w-auto">
                    <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer">
                      <Instagram className="h-4 w-4" />
                      DM on Instagram
                    </a>
                  </Button>
                </div>
                {(request.messages || []).length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">No chat messages yet. Send a message here or DM us on Instagram about this jersey.</p>
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
                        sendRequestMessage(request.id)
                      }
                    }}
                    placeholder="Message terrace.fc about this request..."
                    className="h-11 flex-1 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-accent"
                  />
                  <Button type="button" onClick={() => sendRequestMessage(request.id)} disabled={isSending === request.id || !(replies[request.id] || "").trim()} className="bg-foreground text-background">
                    {isSending === request.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Send
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function AccountPanel({
  customer,
  orders,
  activeTab,
  onTabChange,
  onCustomerChange,
}: {
  customer: CustomerAccount
  orders: StoreOrder[]
  activeTab: ProfileTab
  onTabChange: (tab: ProfileTab) => void
  onCustomerChange: (customer: CustomerAccount) => void
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-black/65 p-3 shadow-2xl shadow-black/35 sm:p-5">
      <div className="flex flex-wrap gap-1 rounded-2xl border border-white/10 bg-black/40 p-1">
        <ProfileTabButton active={activeTab === "account"} icon={<UserRound className="h-4 w-4" />} label="Account" onClick={() => onTabChange("account")} />
        <ProfileTabButton active={activeTab === "orders"} icon={<ClipboardList className="h-4 w-4" />} label="Orders" onClick={() => onTabChange("orders")} />
        <ProfileTabButton active={activeTab === "support"} icon={<MessageCircle className="h-4 w-4" />} label="Support" onClick={() => onTabChange("support")} />
        <ProfileTabButton active={activeTab === "requests"} icon={<Shirt className="h-4 w-4" />} label="Requests" onClick={() => onTabChange("requests")} />
      </div>
      <div className="mt-4 min-h-[420px] bg-[#080506] p-1 text-white sm:p-3">
        {activeTab === "account" && <SettingsPanel customer={customer} onCustomerChange={onCustomerChange} />}
        {activeTab === "orders" && <OrdersPanel customerEmail={customer.email} orders={orders} />}
        {activeTab === "support" && <SupportPanel customer={customer} />}
        {activeTab === "requests" && <JerseyRequestsPanel customer={customer} />}
      </div>
    </section>
  )
}

function SettingsPanel({
  customer,
  onCustomerChange,
}: {
  customer: CustomerAccount
  onCustomerChange: (customer: CustomerAccount) => void
}) {
  const [name, setName] = useState(customer.name)
  const [phone, setPhone] = useState(customer.phone)
  const [message, setMessage] = useState("")

  useEffect(() => {
    setName(customer.name)
    setPhone(customer.phone)
  }, [customer])

  const saveSettings = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage("")

    if (!name.trim()) {
      setMessage("Enter your name.")
      return
    }
    if (!/^[6-9]\d{9}$/.test(phone.trim())) {
      setMessage("Enter a valid 10 digit Indian mobile number.")
      return
    }

    onCustomerChange({
      ...customer,
      name: name.trim(),
      phone: phone.trim(),
    })
    setMessage("Profile updated.")
  }

  return (
    <form onSubmit={saveSettings} className="max-w-2xl rounded-2xl border border-border bg-background/85 p-5 shadow-sm">
      <h2 className="font-black text-xl tracking-tight">Settings</h2>
      <p className="mt-1 text-sm text-muted-foreground">Change your profile details here.</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <ProfileInput label="Name" value={name} onChange={setName} />
        <ProfileInput label="Phone" value={phone} onChange={setPhone} inputMode="numeric" />
        <ReadonlyField label="Email" value={customer.email} />
        <ReadonlyField label="Customer ID" value={customer.id} />
      </div>

      {message && (
        <div className="mt-4 rounded-xl border border-accent/30 bg-accent/10 p-3 text-xs font-bold text-accent">
          {message}
        </div>
      )}

      <Button type="submit" className="mt-5 h-11 bg-foreground text-background font-black uppercase tracking-wider">
        Save Settings
      </Button>
    </form>
  )
}

function getOrderStatusLabel(status: StoreOrder["status"]) {
  if (status === "paid") return "Paid"
  if (status === "cod") return "Cash on Delivery"
  return "Test Order"
}

function getFulfillmentLabel(status: StoreOrder["fulfillmentStatus"]) {
  return getFulfillmentStatusLabel(status)
}

function canRequestCancellation(order: StoreOrder, now: number) {
  if (order.cancellationRequestedAt || order.fulfillmentStatus === "cancelled") return false
  if (!["pending", "confirmed", "packaged"].includes(order.fulfillmentStatus || "confirmed")) return false
  const createdAt = new Date(order.createdAt).getTime()
  return Number.isFinite(createdAt) && now - createdAt <= 24 * 60 * 60 * 1000
}

function normalizeCustomization(customization: StoreOrder["items"][number]["customization"]) {
  return {
    enabled: Boolean(customization?.enabled),
    mode: customization?.mode || "plain",
    name: String(customization?.name || ""),
    number: String(customization?.number || ""),
    patches: Boolean(customization?.patches),
    patchType: String(customization?.patchType || "").trim() || undefined,
  }
}

function ProfileTabButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-xs font-black uppercase tracking-widest transition-colors ${
        active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-black">{value}</p>
    </div>
  )
}

function ProfileInput({
  label,
  value,
  onChange,
  type = "text",
  inputMode,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  inputMode?: "text" | "numeric" | "email" | "tel"
}) {
  return (
    <label className="space-y-1">
      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</span>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full h-11 rounded-xl border border-border bg-secondary/30 px-3 text-sm font-medium outline-none focus:border-accent"
      />
    </label>
  )
}

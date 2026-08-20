"use client"

import { FormEvent, useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { CheckCircle2, CreditCard, Loader2, MapPin, PackageCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { OrderAddress, OrderItem } from "@/lib/orders"

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void
      on: (event: string, handler: (response: any) => void) => void
    }
  }
}

type RecoveryOrder = {
  id: string
  name: string
  phone: string
  email: string
  address: OrderAddress
  items: OrderItem[]
}

type PaymentQuote = {
  keyId: string
  razorpayOrderId: string
  amount: number
  currency: string
  fee: number
  forwardFee: number
  rtoFee: number
  estimatedDays?: number | null
  address: OrderAddress
}

export default function RedeliveryPage() {
  const params = useParams()
  const router = useRouter()
  const token = String(params.token || "")
  const [order, setOrder] = useState<RecoveryOrder | null>(null)
  const [address, setAddress] = useState<OrderAddress | null>(null)
  const [useOriginal, setUseOriginal] = useState(true)
  const [quote, setQuote] = useState<PaymentQuote | null>(null)
  const [message, setMessage] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isChecking, setIsChecking] = useState(false)
  const [isPaying, setIsPaying] = useState(false)

  useEffect(() => {
    fetch(`/api/redelivery?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => null)
        if (!response.ok) throw new Error(data.error || "Recovery link could not be opened.")
        setOrder(data.order)
        setAddress(data.order.address)
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "Recovery link could not be opened."))
      .finally(() => setIsLoading(false))
  }, [token])

  const updateAddress = (field: keyof OrderAddress, value: string) => {
    setQuote(null)
    setAddress((current) => current ? {
      ...current,
      [field]: field === "pincode" || field === "phone" ? value.replace(/\D/g, "") : value,
    } : current)
  }

  const checkPrice = async (event: FormEvent) => {
    event.preventDefault()
    if (!address) return
    setMessage("")
    setIsChecking(true)
    try {
      const response = await fetch("/api/redelivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, address }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data.error || "Re-shipping price could not be checked.")
      setQuote(data)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Re-shipping price could not be checked.")
    } finally {
      setIsChecking(false)
    }
  }

  const payForRedelivery = async () => {
    if (!quote || !address) return
    setMessage("")
    setIsPaying(true)
    try {
      const ready = await loadRazorpayScript()
      if (!ready || !window.Razorpay) throw new Error("Razorpay checkout could not be loaded.")

      const checkout = new window.Razorpay({
        key: quote.keyId,
        amount: quote.amount,
        currency: quote.currency,
        order_id: quote.razorpayOrderId,
        name: "terrace.fc",
        description: `Re-shipping for ${order.id}`,
        prefill: {
          name: address.name,
          email: address.email,
          contact: address.phone,
        },
        handler: async (payment: any) => {
          const response = await fetch("/api/redelivery/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              token,
              address,
              razorpay_order_id: payment.razorpay_order_id,
              razorpay_payment_id: payment.razorpay_payment_id,
              razorpay_signature: payment.razorpay_signature,
            }),
          })
          const data = await response.json().catch(() => null)
          if (!response.ok) {
            setMessage(data.error || "Payment succeeded but re-shipping could not be created.")
            setIsPaying(false)
            return
          }
          router.replace(`/orders/${encodeURIComponent(data.order.id)}`)
        },
        modal: {
          ondismiss: () => setIsPaying(false),
        },
      })
      checkout.on("payment.failed", (response: any) => {
        setMessage(response.error.description || "Payment failed. Please try again.")
        setIsPaying(false)
      })
      checkout.open()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Payment could not be opened.")
      setIsPaying(false)
    }
  }

  if (isLoading) {
    return <main className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-7 w-7 animate-spin text-accent" /></main>
  }

  if (!order || !address) {
    return (
      <main className="min-h-screen bg-background px-4 py-16 text-foreground">
        <div className="mx-auto max-w-xl rounded-2xl border border-border p-6">
          <h1 className="text-3xl font-black">Recovery link unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground sm:px-6">
      <div className="mx-auto max-w-3xl">
        <p className="text-xs font-black uppercase tracking-widest text-accent">Delivery Recovery</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight">Get Your Jersey Back</h1>
        <p className="mt-2 text-sm text-muted-foreground">Confirm where we should send order {order.id} and pay only the live Shiprocket re-shipping fee.</p>

        {message && <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm font-bold text-red-500">{message}</div>}

        <form onSubmit={checkPrice} className="mt-6 space-y-5 rounded-2xl border border-border bg-background/85 p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-accent" />
            <h2 className="text-xl font-black">Delivery Address</h2>
          </div>

          <div className="rounded-xl border border-border bg-secondary/20 p-4 text-sm">
            <p className="font-black">{order.address.houseNumber}</p>
            <p>{order.address.address}</p>
            <p>{order.address.city}, {order.address.state} - {order.address.pincode}</p>
            {order.address.deliveryInstructions && <p className="mt-2 text-muted-foreground">Instructions: {order.address.deliveryInstructions}</p>}
          </div>

          <label className="flex items-center gap-3 rounded-xl border border-border px-3 py-3 text-sm font-bold">
            <input
              type="checkbox"
              checked={useOriginal}
              onChange={(event) => {
                const checked = event.target.checked
                setUseOriginal(checked)
                setQuote(null)
                if (checked) setAddress(order.address)
              }}
            />
            Use original delivery address
          </label>

          {!useOriginal && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" value={address.name} onChange={(value) => updateAddress("name", value)} />
              <Field label="Mobile number" value={address.phone} onChange={(value) => updateAddress("phone", value)} inputMode="numeric" />
              <Field label="Email" value={address.email} onChange={(value) => updateAddress("email", value)} className="sm:col-span-2" />
              <Field label="House / flat / tower / floor" value={address.houseNumber || ""} onChange={(value) => updateAddress("houseNumber", value)} className="sm:col-span-2" />
              <Field label="Road, area, apartment or community" value={address.address} onChange={(value) => updateAddress("address", value)} className="sm:col-span-2" />
              <Field label="City" value={address.city} onChange={(value) => updateAddress("city", value)} />
              <Field label="State" value={address.state} onChange={(value) => updateAddress("state", value)} />
              <Field label="PIN code" value={address.pincode} onChange={(value) => updateAddress("pincode", value)} inputMode="numeric" />
              <Field label="Delivery instructions" value={address.deliveryInstructions || ""} onChange={(value) => updateAddress("deliveryInstructions", value)} className="sm:col-span-2" />
            </div>
          )}

          <Button type="submit" disabled={isChecking} className="h-12 w-full bg-foreground text-background font-black uppercase tracking-wider">
            {isChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
            Check Re-shipping Price
          </Button>
        </form>

        {quote && (
          <section className="mt-5 rounded-2xl border border-accent/30 bg-accent/5 p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-accent">Live Shiprocket Price</p>
            <p className="mt-1 text-4xl font-black">₹{quote.fee.toLocaleString("en-IN")}</p>
            <div className="mt-4 space-y-2 rounded-xl border border-border bg-background/70 p-4 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Return-to-origin charge</span>
                <span className="font-black">₹{quote.rtoFee.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">New forward shipping</span>
                <span className="font-black">₹{quote.forwardFee.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between gap-3 border-t border-border pt-2">
                <span className="font-black">Total payment</span>
                <span className="font-black">₹{quote.fee.toLocaleString("en-IN")}</span>
              </div>
            </div>
            {quote.estimatedDays && <p className="mt-1 text-sm text-muted-foreground">Estimated courier time: {quote.estimatedDays} days</p>}
            <Button type="button" onClick={payForRedelivery} disabled={isPaying} className="mt-5 h-12 w-full bg-foreground text-background font-black uppercase tracking-wider">
              {isPaying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              Pay & Send My Jersey Again
            </Button>
          </section>
        )}

        <div className="mt-6 flex items-center gap-2 text-xs font-bold text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          Payment is only for the new courier charge. Your jerseys are not charged again.
        </div>
      </div>
    </main>
  )
}

function Field({ label, value, onChange, inputMode, className = "" }: { label: string; value: string; onChange: (value: string) => void; inputMode?: "text" | "numeric"; className?: string }) {
  return (
    <label className={`space-y-1 ${className}`}>
      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} inputMode={inputMode} className="h-11 w-full rounded-xl border border-border bg-secondary/30 px-3 text-sm font-bold outline-none focus:border-accent" />
    </label>
  )
}

function loadRazorpayScript() {
  return new Promise<boolean>((resolve) => {
    if (window.Razorpay) return resolve(true)
    const script = document.createElement("script")
    script.src = "https://checkout.razorpay.com/v1/checkout.js"
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

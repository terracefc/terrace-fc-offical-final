"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ImagePlus, Instagram, Loader2, Send, Shirt, X } from "lucide-react"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { CartDrawer } from "@/components/cart-drawer"
import { SearchModal } from "@/components/search-modal"
import { RequestJerseyAssistant } from "@/components/customer-guided-assistants"
import { Button } from "@/components/ui/button"
import { readCustomer, type CustomerAccount } from "@/lib/customer-auth"

const INSTAGRAM_URL = "https://www.instagram.com/terrace.fc_/"
const MAX_REQUEST_PHOTO_BYTES = 2 * 1024 * 1024

type RequestPhoto = { id: string; name: string; type: string; size: number; dataUrl: string }
type AssistantDraft = {
  clubOrCountry: string
  playerName: string
  number: string
  year: string
  notes: string
}

const emptyDraft: AssistantDraft = {
  clubOrCountry: "",
  playerName: "",
  number: "",
  year: "",
  notes: "",
}

export default function RequestJerseyPage() {
  const [customer, setCustomer] = useState<CustomerAccount | null>(null)
  const [draft, setDraft] = useState<AssistantDraft>(emptyDraft)
  const [photo, setPhoto] = useState<RequestPhoto | null>(null)
  const [message, setMessage] = useState("")
  const [submittedRequestId, setSubmittedRequestId] = useState("")
  const [isSending, setIsSending] = useState(false)

  useEffect(() => {
    setCustomer(readCustomer())
  }, [])

  const customerName = customer?.name || "Customer"
  const customerEmail = customer?.email || ""
  const isReadyToSubmit = Boolean(draft.clubOrCountry && draft.year)

  const summary = useMemo(() => {
    return [
      ["Club / Country", draft.clubOrCountry],
      ["Player / Print", draft.playerName || "Plain / not selected"],
      ["Number", draft.number || "No number"],
      ["Year / Season", draft.year],
    ].filter(([, value]) => Boolean(value))
  }, [draft])

  const submitRequest = async () => {
    setMessage("")
    setSubmittedRequestId("")

    if (!customerEmail) {
      setMessage("Please login again so we can attach this request to your account.")
      return
    }

    if (!isReadyToSubmit) {
      setMessage("Finish the assistant questions first, then submit the request.")
      return
    }

    setIsSending(true)
    try {
      const response = await fetch("/api/jersey-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: customerName,
          email: customerEmail,
          clubOrCountry: draft.clubOrCountry,
          playerName: draft.playerName,
          number: draft.number,
          year: draft.year,
          notes: draft.notes,
          photo,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Could not send request.")

      setSubmittedRequestId(data.request.id)
      setMessage(`Request sent. Your request number is ${data.request.id}.`)
      setDraft(emptyDraft)
      setPhoto(null)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Please try again.")
    } finally {
      setIsSending(false)
    }
  }

  return (
    <main className="dark min-h-screen bg-[#090405] text-white">
      <Header />
      <section className="relative overflow-hidden px-4 pb-20 pt-32 sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_12%,rgba(220,38,38,0.26),transparent_32%),radial-gradient(circle_at_84%_74%,rgba(127,29,29,0.28),transparent_34%)]" />
        <div className="relative mx-auto grid max-w-6xl gap-6 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
          <section className="rounded-2xl border border-red-500/20 bg-black/35 p-5 backdrop-blur-sm sm:p-7">
            <div className="inline-flex items-center gap-2 border border-red-400/40 bg-red-600/15 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-red-200">
              <Shirt className="h-4 w-4" />
              Request Jersey
            </div>
            <h1 className="text-outline-white mt-5 text-4xl font-black uppercase leading-none tracking-[0.02em] sm:text-6xl">
              Ask The Assistant
            </h1>
            <p className="mt-4 max-w-xl text-sm font-bold leading-6 text-white/70">
              Answer the quick questions, attach a reference photo if you have one, then submit it straight to admin.
            </p>
            <Button asChild className="mt-5 bg-red-600 font-black uppercase tracking-widest text-white hover:bg-white hover:text-black">
              <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer">
                <Instagram className="h-4 w-4" />
                DM us on Instagram
              </a>
            </Button>
          </section>

          <section className="grid gap-4">
            <RequestJerseyAssistant
              onUpdate={(updates) =>
                setDraft((current) => ({
                  ...current,
                  ...updates,
                  notes: [current.notes, updates.notes].filter(Boolean).join(current.notes && updates.notes ? "\n" : ""),
                }))
              }
            />

            <div className="rounded-2xl border border-red-500/25 bg-black/45 p-4 backdrop-blur-sm sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-red-300">Ready to submit</p>
                  <h2 className="mt-1 text-xl font-black tracking-tight">Request Details</h2>
                </div>
                <Button onClick={submitRequest} disabled={isSending || !isReadyToSubmit} className="bg-red-600 font-black uppercase tracking-widest text-white hover:bg-white hover:text-black">
                  {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Submit
                </Button>
              </div>

              {summary.length > 0 ? (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {summary.map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/45">{label}</p>
                      <p className="mt-1 text-sm font-black text-white">{value}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 text-sm font-bold text-white/65">
                  The assistant will fill this as you answer.
                </p>
              )}

              <div className="mt-4">
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-red-400/35 bg-red-600/10 p-4 text-xs font-black uppercase tracking-widest text-red-100 hover:bg-red-600/20">
                  <ImagePlus className="h-4 w-4" />
                  Add Reference Photo
                  <input type="file" className="hidden" accept="image/*" onChange={(event) => readRequestPhoto(event.target.files?.[0] || null).then(setPhoto)} />
                </label>
                {photo && (
                  <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                    <img src={photo.dataUrl} alt={photo.name} className="h-16 w-16 rounded-lg object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black">{photo.name}</p>
                      <p className="text-xs text-white/55">Reference photo attached</p>
                    </div>
                    <button type="button" onClick={() => setPhoto(null)} className="rounded-lg border border-white/10 p-2 hover:bg-white/10" aria-label="Remove photo">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              {message && (
                <div className="mt-4 rounded-xl border border-red-400/25 bg-red-600/10 p-3 text-sm font-bold text-red-100">
                  <p>{message}</p>
                  {submittedRequestId && (
                    <Link href="/profile?tab=requests" className="mt-3 inline-flex text-xs font-black uppercase tracking-widest text-white underline">
                      View request chat
                    </Link>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      </section>
      <Footer />
      <CartDrawer />
      <SearchModal />
    </main>
  )
}

function readRequestPhoto(file: File | null) {
  return new Promise<RequestPhoto | null>((resolve) => {
    if (!file || file.size > MAX_REQUEST_PHOTO_BYTES || !file.type.startsWith("image/")) {
      resolve(null)
      return
    }

    const reader = new FileReader()
    reader.onload = () => resolve({
      id: crypto.randomUUID(),
      name: file.name,
      type: file.type,
      size: file.size,
      dataUrl: String(reader.result || ""),
    })
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })
}

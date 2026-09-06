"use client"

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Check, ClipboardList, ImagePlus, Mail, MessageCircle, PackageCheck, Send, Shirt, Star, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { readCustomer, type CustomerAccount } from "@/lib/customer-auth"
import { fetchOrders, getOrderDisplayId, readOrders, type StoreOrder } from "@/lib/orders"
import { getOrderStatusLabel } from "@/lib/tracking"

type PanelView = "home" | "orders" | "request" | "ask"
type RequestStep = "team" | "year" | "type" | "print" | "version" | "custom" | "photo" | "review" | "sent"
type RequestPhoto = { id: string; name: string; type: string; size: number; dataUrl: string }

const MAX_REQUEST_PHOTO_BYTES = 2 * 1024 * 1024

export function SupportFloatingButton() {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const [view, setView] = useState<PanelView>("home")
  const [customer, setCustomer] = useState<CustomerAccount | null>(null)
  const [orders, setOrders] = useState<StoreOrder[]>([])
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isOpen) return

    const currentCustomer = readCustomer()
    setCustomer(currentCustomer)
    setOrders(readOrders())
    fetchOrders().then(setOrders).catch(() => null)
  }, [isOpen])

  const customerOrders = useMemo(() => {
    if (!customer) return []
    const email = customer.email.toLowerCase()
    return orders
      .filter((order) => order.customerId === customer.id || order.customerEmail?.toLowerCase() === email || order.address?.email?.toLowerCase() === email)
      .slice(0, 4)
  }, [customer, orders])

  useEffect(() => {
    if (!isOpen) return
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [isOpen, view, customerOrders.length])

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIsOpen(true)
          setView("home")
        }}
        className="fixed bottom-5 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-white shadow-2xl transition-transform hover:-translate-y-0.5 hover:bg-white hover:text-black sm:bottom-7 sm:right-6"
        aria-label="Open support chat"
      >
        <MessageCircle className="h-5 w-5" />
        {pathname === "/" && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[10px] font-black text-red-600 ring-2 ring-black">1</span>}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 pointer-events-none">
          <button
            type="button"
            className="absolute inset-0 hidden bg-black/20 pointer-events-auto sm:block"
            aria-label="Close support panel"
            onClick={() => setIsOpen(false)}
          />
          <aside className="absolute bottom-0 right-0 flex max-h-[82svh] w-full max-w-[380px] flex-col overflow-hidden rounded-t-2xl border border-red-500/25 bg-[#080506] text-white shadow-2xl pointer-events-auto sm:bottom-7 sm:right-6 sm:rounded-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-black p-3.5 text-white">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-red-300">terrace.fc</p>
                <h2 className="text-base font-black">How can we help?</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
                aria-label="Close support"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex gap-2 overflow-x-auto border-b border-white/10 px-3 py-2.5">
              <TabButton active={view === "home"} onClick={() => setView("home")}>Help</TabButton>
              <TabButton active={view === "orders"} onClick={() => setView("orders")}>Track</TabButton>
              <TabButton active={view === "request"} onClick={() => setView("request")}>Request</TabButton>
              <TabButton active={view === "ask"} onClick={() => setView("ask")}>Ask</TabButton>
            </div>

            <div className="min-h-[315px] overflow-y-auto p-3">
              {view === "home" && (
                <div className="space-y-3">
                  <AssistantBubble>
                    Track your order, request a jersey, or message us directly. Returns are not available on this store.
                  </AssistantBubble>
                  <QuickAction icon={<PackageCheck className="h-5 w-5" />} title="Track Order" text="See your latest order status without leaving this page." onClick={() => setView("orders")} />
                  <QuickAction icon={<Shirt className="h-5 w-5" />} title="Request Jersey" text="Tell us the football, F1, or cricket jersey you want." onClick={() => setView("request")} />
                  <QuickAction icon={<MessageCircle className="h-5 w-5" />} title="Something Else" text="Ask a quick store question here." onClick={() => setView("ask")} />
                  <QuickLink href="mailto:terrace.fc@terracefc.com?subject=Terrace.fc%20help" icon={<Mail className="h-5 w-5" />} title="Email terrace.fc" text="terrace.fc@terracefc.com" />
                  <QuickLink href="https://wa.me/918147338142" icon={<MessageCircle className="h-5 w-5" />} title="WhatsApp" text="Chat with us directly" />
                </div>
              )}

              {view === "orders" && (
                <div className="space-y-3">
                  <AssistantBubble>Choose an order below to check the current progress.</AssistantBubble>
                  {!customer ? (
                    <LoginBox />
                  ) : customerOrders.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-white/60">
                      No orders found for this login.
                    </div>
                  ) : (
                    customerOrders.map((order) => (
                      <div key={order.id} className="rounded-xl border border-white/10 bg-white/[0.06] p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-black uppercase tracking-widest text-white/55">{getOrderDisplayId(order)}</p>
                            <p className="mt-1 text-sm font-black">{getOrderStatusLabel(order.fulfillmentStatus)}</p>
                          </div>
                          <ClipboardList className="h-5 w-5 text-red-300" />
                        </div>
                        {order.delhiveryStatus && <p className="mt-2 text-xs text-white/60">{order.delhiveryStatus}</p>}
                        {order.estimatedDelivery && <p className="mt-1 text-xs font-bold text-white/60">Expected: {order.estimatedDelivery}</p>}
                      </div>
                    ))
                  )}
                </div>
              )}

              {view === "request" && <RequestAssistant customer={customer} />}
              {view === "ask" && <QuestionAssistant />}
              <div ref={chatEndRef} />
            </div>
          </aside>
        </div>
      )}
    </>
  )
}

function TabButton({ active, children, onClick }: { active: boolean; children: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-8 rounded-full px-3 text-[10px] font-black uppercase tracking-widest ${active ? "bg-red-600 text-white" : "border border-white/10 text-white/70 hover:bg-white/10"}`}
    >
      {children}
    </button>
  )
}

function AssistantBubble({ children }: { children: string }) {
  return (
    <div className="max-w-[92%] rounded-2xl rounded-tl-sm border border-white/10 bg-white/[0.06] p-3 text-xs font-medium leading-relaxed text-white/82 sm:text-sm">
      {children}
    </div>
  )
}

function QuickAction({ icon, title, text, onClick }: { icon: ReactNode; title: string; text: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.06] p-2.5 text-left hover:bg-white/10"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-600 text-white">{icon}</span>
      <span>
        <span className="block text-sm font-black">{title}</span>
        <span className="mt-0.5 block text-xs text-white/58">{text}</span>
      </span>
    </button>
  )
}

function QuickLink({ href, icon, title, text }: { href: string; icon: ReactNode; title: string; text: string }) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.06] p-2.5 text-left hover:bg-white/10"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-600 text-white">{icon}</span>
      <span>
        <span className="block text-sm font-black">{title}</span>
        <span className="mt-0.5 block text-xs text-white/58">{text}</span>
      </span>
    </Link>
  )
}

function QuickMiniLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex h-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-[10px] font-black uppercase tracking-widest hover:bg-white/10"
    >
      {label}
    </Link>
  )
}

function LoginBox() {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.06] p-4">
      <p className="text-sm font-black">Login needed</p>
      <p className="mt-1 text-xs text-white/60">Login so we can show your orders.</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button asChild className="h-10 bg-red-600 text-white">
          <Link href="/login">Login</Link>
        </Button>
        <Button asChild variant="outline" className="h-10">
          <Link href="/signup">Sign up</Link>
        </Button>
      </div>
    </div>
  )
}

function RequestAssistant({ customer }: { customer: CustomerAccount | null }) {
  const [step, setStep] = useState<RequestStep>("team")
  const [clubOrCountry, setClubOrCountry] = useState("")
  const [year, setYear] = useState("")
  const [kitType, setKitType] = useState("")
  const [printChoice, setPrintChoice] = useState("No name")
  const [version, setVersion] = useState("Fan")
  const [customName, setCustomName] = useState("")
  const [customNumber, setCustomNumber] = useState("")
  const [photo, setPhoto] = useState<RequestPhoto | null>(null)
  const [message, setMessage] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [rating, setRating] = useState<number | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [step, clubOrCountry, year, kitType, printChoice, version, customName, customNumber, photo, message])

  const canSubmit = customer && clubOrCountry.trim() && year.trim() && kitType && printChoice && version
  const playerName = printChoice === "Custom name" ? `${customName || "Custom"} ${customNumber}`.trim() : printChoice
  const notes = [
    `Kit type: ${kitType}`,
    `Version: ${version}`,
    `Back print: ${printChoice}`,
    printChoice === "Custom name" ? `Custom name/number: ${customName || "-"} ${customNumber || ""}`.trim() : "",
  ].filter(Boolean).join("\n")

  async function submitRequest() {
    if (!customer || !canSubmit) return
    setMessage("")
    setIsSubmitting(true)
    try {
      const response = await fetch("/api/jersey-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: customer.name,
          email: customer.email,
          clubOrCountry,
          year,
          playerName,
          number: printChoice === "Custom name" ? customNumber : "",
          notes,
          photo,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Could not submit this request.")
      setStep("sent")
      setMessage("Request submitted. We will check availability and reply from your profile/request thread.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not submit this request.")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!customer) {
    return (
      <div className="space-y-3">
        <AssistantBubble>Login first so your jersey request, replies, and photos stay connected to your account.</AssistantBubble>
        <LoginBox />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <AssistantBubble>Let us build the request properly. First, which club or country do you want?</AssistantBubble>
      <ChatAnswer show={!!clubOrCountry}>{clubOrCountry}</ChatAnswer>
      {step === "team" && (
        <InlineInput
          placeholder="Example: Portugal, Real Madrid, RCB"
          value={clubOrCountry}
          onChange={setClubOrCountry}
          onNext={() => clubOrCountry.trim() && setStep("year")}
        />
      )}

      {stepAfter(step, "year") && <AssistantBubble>Which year or season should it be?</AssistantBubble>}
      <ChatAnswer show={!!year}>{year}</ChatAnswer>
      {step === "year" && (
        <InlineInput placeholder="Example: 2026 or 2007-08" value={year} onChange={setYear} onNext={() => year.trim() && setStep("type")} />
      )}

      {stepAfter(step, "type") && <AssistantBubble>Which kit style is it?</AssistantBubble>}
      <ChatAnswer show={!!kitType}>{kitType}</ChatAnswer>
      {step === "type" && (
        <ChoiceGrid options={["Home", "Away", "Third kit", "Concept", "Training"]} onPick={(value) => { setKitType(value); setStep("print") }} />
      )}

      {stepAfter(step, "print") && <AssistantBubble>What do you want on the back?</AssistantBubble>}
      <ChatAnswer show={!!printChoice}>{printChoice}</ChatAnswer>
      {step === "print" && (
        <ChoiceGrid options={["No name", "Original name", "Custom name"]} onPick={(value) => { setPrintChoice(value); setStep(value === "Custom name" ? "custom" : "version") }} />
      )}

      {step === "custom" && (
        <div className="space-y-2">
          <AssistantBubble>Enter the custom name and number.</AssistantBubble>
          <div className="grid grid-cols-[1fr_76px] gap-2">
            <input value={customName} onChange={(event) => setCustomName(event.target.value.toUpperCase())} placeholder="Name" className="h-10 rounded-xl border border-white/10 bg-black/50 px-3 text-sm font-bold text-white outline-none focus:border-red-500" />
            <input value={customNumber} onChange={(event) => setCustomNumber(event.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="No." className="h-10 rounded-xl border border-white/10 bg-black/50 px-3 text-sm font-bold text-white outline-none focus:border-red-500" />
          </div>
          <button type="button" onClick={() => customName.trim() && customNumber.trim() && setStep("version")} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-red-600 text-xs font-black uppercase tracking-widest text-white hover:bg-white hover:text-black">
            Continue <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {stepAfter(step, "version") && <AssistantBubble>Which version should we check?</AssistantBubble>}
      <ChatAnswer show={!!version && stepAfter(step, "version")}>{version}</ChatAnswer>
      {step === "version" && (
        <ChoiceGrid options={["Embroided", "Fan", "Master", "Player"]} onPick={(value) => { setVersion(value); setStep("photo") }} />
      )}

      {stepAfter(step, "photo") && <AssistantBubble>Attach a reference photo if you have one. You can also skip it.</AssistantBubble>}
      {photo && (
        <div className="ml-auto flex max-w-[86%] items-center gap-2 rounded-2xl rounded-tr-sm bg-red-600 p-2 text-white">
          <img src={photo.dataUrl} alt={photo.name} className="h-12 w-12 rounded-lg object-cover" />
          <span className="truncate text-xs font-black">{photo.name}</span>
        </div>
      )}
      {step === "photo" && (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] text-xs font-black uppercase tracking-widest hover:bg-white/10">
            <ImagePlus className="h-4 w-4" />
            Photo
            <input type="file" accept="image/*" className="hidden" onChange={(event) => readRequestPhoto(event).then((nextPhoto) => nextPhoto && setPhoto(nextPhoto))} />
          </label>
          <button type="button" onClick={() => setStep("review")} className="h-10 rounded-xl bg-red-600 text-xs font-black uppercase tracking-widest text-white hover:bg-white hover:text-black">
            {photo ? "Continue" : "Skip"}
          </button>
        </div>
      )}

      {step === "review" && (
        <div className="space-y-3">
          <AssistantBubble>Ready to submit. Check this once:</AssistantBubble>
          <div className="rounded-xl border border-white/10 bg-white/[0.06] p-3 text-xs font-bold leading-relaxed text-white/78">
            <p><b className="text-white">Team:</b> {clubOrCountry}</p>
            <p><b className="text-white">Year:</b> {year}</p>
            <p><b className="text-white">Type:</b> {kitType}</p>
            <p><b className="text-white">Back:</b> {printChoice === "Custom name" ? `${customName} ${customNumber}` : printChoice}</p>
            <p><b className="text-white">Version:</b> {version}</p>
            <p><b className="text-white">Photo:</b> {photo ? "Attached" : "No photo"}</p>
          </div>
          <button type="button" onClick={submitRequest} disabled={!canSubmit || isSubmitting} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-600 text-xs font-black uppercase tracking-widest text-white hover:bg-white hover:text-black disabled:opacity-60">
            {isSubmitting ? "Submitting..." : "Submit Request"} <Check className="h-4 w-4" />
          </button>
        </div>
      )}

      {message && (
        <div className="rounded-xl border border-red-400/20 bg-red-600/12 p-3 text-xs font-bold text-red-100">
          {message}
        </div>
      )}

      {step === "sent" && (
        <div className="space-y-2">
          <AssistantBubble>How was this request flow?</AssistantBubble>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((value) => (
              <button key={value} type="button" onClick={() => setRating(value)} className={`flex h-9 flex-1 items-center justify-center rounded-xl border border-white/10 ${rating && value <= rating ? "bg-red-600 text-white" : "bg-white/[0.06] text-white/60"}`}>
                <Star className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  )
}

function QuestionAssistant() {
  const [question, setQuestion] = useState("")
  const [answer, setAnswer] = useState("")
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [answer])

  function reply() {
    const text = question.trim()
    if (!text) return
    setAnswer(getSupportReply(text))
  }

  return (
    <div className="space-y-3">
      <AssistantBubble>Ask a quick question about orders, delivery, sizing, payment, or customisation.</AssistantBubble>
      {answer && <ChatAnswer show>{question}</ChatAnswer>}
      {answer && <AssistantBubble>{answer}</AssistantBubble>}
      <div className="flex gap-2">
        <input
          value={question}
          onChange={(event) => {
            setQuestion(event.target.value)
            setAnswer("")
          }}
          onKeyDown={(event) => { if (event.key === "Enter") reply() }}
          placeholder="Type your question..."
          className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/50 px-3 text-sm font-bold text-white outline-none placeholder:text-white/35 focus:border-red-500"
        />
        <button type="button" onClick={reply} className="flex h-10 w-11 items-center justify-center rounded-xl bg-red-600 text-white hover:bg-white hover:text-black" aria-label="Send question">
          <Send className="h-4 w-4" />
        </button>
      </div>
      <div ref={endRef} />
    </div>
  )
}

function getSupportReply(question: string) {
  const text = question.toLowerCase()
  if (/(admin|password|profit|supplier|private|confidential|other customer|everyone|all orders|backend|token|api key)/.test(text)) {
    return "Sorry, I cannot provide private store, admin, or other customer information. For help with your own order, please use Track Order after logging in."
  }
  if (/(return|refund|exchange|cancel)/.test(text)) {
    return "Returns are not available on this store. If you need help with an order issue, please contact us on WhatsApp or email and we will review it professionally."
  }
  if (/(track|order|delivery|where|awb|shipment)/.test(text)) {
    return "To check your order, open Track in this support bubble after logging in. It will show your latest saved order progress and expected delivery when available."
  }
  if (/(size|fit|small|medium|large|xl|player)/.test(text)) {
    return "Fan, Master, and Embroided have a regular fit. Player version is a tighter fit, so size up if you prefer a relaxed feel."
  }
  if (/(custom|name|number|print|original)/.test(text)) {
    return "You can choose no name, original name, or custom name and number. Customisation adds extra time because the print has to be prepared separately."
  }
  if (/(price|cost|shipping|pay|payment)/.test(text)) {
    return "Prices and shipping are shown clearly in your cart and checkout before payment. Shipping time depends on your delivery location."
  }
  if (/(f1|cricket|kids)/.test(text)) {
    return "Football and F1 products are being organised by section. Cricket is coming soon, and kids football jerseys will be listed separately when available."
  }
  return "Thanks for asking. For anything specific to your order or a jersey request, please use Track Order or Request Jersey in this support bubble so we can keep the details connected to your account."
}

function InlineInput({ value, onChange, onNext, placeholder }: { value: string; onChange: (value: string) => void; onNext: () => void; placeholder: string }) {
  return (
    <div className="flex gap-2">
      <input value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onNext() }} placeholder={placeholder} className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/50 px-3 text-sm font-bold text-white outline-none placeholder:text-white/35 focus:border-red-500" />
      <button type="button" onClick={onNext} className="flex h-10 w-11 items-center justify-center rounded-xl bg-red-600 text-white hover:bg-white hover:text-black" aria-label="Next">
        <Send className="h-4 w-4" />
      </button>
    </div>
  )
}

function ChoiceGrid({ options, onPick }: { options: string[]; onPick: (value: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((option) => (
        <button key={option} type="button" onClick={() => onPick(option)} className="min-h-10 rounded-xl border border-white/10 bg-white/[0.06] px-3 text-xs font-black uppercase tracking-widest text-white hover:bg-red-600">
          {option}
        </button>
      ))}
    </div>
  )
}

function ChatAnswer({ show, children }: { show: boolean; children: ReactNode }) {
  if (!show) return null
  return (
    <div className="ml-auto max-w-[86%] rounded-2xl rounded-tr-sm bg-red-600 px-3 py-2 text-xs font-black uppercase tracking-wider text-white">
      {children}
    </div>
  )
}

function stepAfter(current: RequestStep, target: RequestStep) {
  const order: RequestStep[] = ["team", "year", "type", "print", "custom", "version", "photo", "review", "sent"]
  return order.indexOf(current) >= order.indexOf(target)
}

function readRequestPhoto(event: ChangeEvent<HTMLInputElement>) {
  const file = event.target.files?.[0]
  event.target.value = ""
  return new Promise<RequestPhoto | null>((resolve) => {
    if (!file || file.size > MAX_REQUEST_PHOTO_BYTES || !file.type.startsWith("image/")) {
      resolve(null)
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      resolve({
        id: crypto.randomUUID(),
        name: file.name,
        type: file.type,
        size: file.size,
        dataUrl: String(reader.result || ""),
      })
    }
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })
}

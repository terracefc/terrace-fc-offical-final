"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import { Bot, Check, Loader2, Send, X } from "lucide-react"

type ChatMessage = {
  id: string
  sender: "assistant" | "customer"
  text: string
}

type Choice = {
  label: string
  value: string
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export function RequestJerseyAssistant({
  onUpdate,
}: {
  onUpdate: (updates: Partial<{ clubOrCountry: string; playerName: string; number: string; year: string; notes: string }>) => void
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const [step, setStep] = useState<"intro" | "version" | "intent" | "back" | "name" | "number" | "club" | "player" | "year" | "done">("intro")
  const [input, setInput] = useState("")
  const [review, setReview] = useState<Array<[string, string]>>([])
  const [draft, setDraft] = useState({
    version: "",
    backType: "",
    name: "",
    number: "",
    clubOrCountry: "",
    playerName: "",
    year: "",
  })
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    void say("Hi, I can help you request a jersey. I will ask a few quick questions and fill the request form for you.")
  }, [])

  const choices = useMemo<Choice[]>(() => {
    if (step === "intro") return [{ label: "Start", value: "start" }]
    if (step === "version") return [
      { label: "Fan Version", value: "Fan Version" },
      { label: "Player Version", value: "Player Version" },
      { label: "Master Version", value: "Master Version" },
    ]
    if (step === "intent") return [
      { label: "Yes, I want to buy", value: "yes" },
      { label: "Just checking", value: "checking" },
    ]
    if (step === "back") return [
      { label: "Original name", value: "Original name" },
      { label: "Custom name", value: "Custom name" },
      { label: "No name", value: "No name" },
    ]
    return []
  }, [step])

  async function say(text: string) {
    setIsTyping(true)
    await wait(450)
    setMessages((current) => [...current, { id: crypto.randomUUID(), sender: "assistant", text }])
    setIsTyping(false)
  }

  async function choose(choice: Choice) {
    setMessages((current) => [...current, { id: crypto.randomUUID(), sender: "customer", text: choice.label }])

    if (step === "intro") {
      setStep("version")
      await say("Which version would you prefer?")
      return
    }
    if (step === "version") {
      setDraft((current) => ({ ...current, version: choice.value }))
      setStep("intent")
      await say(`${choice.value} is selected. If we can arrange this jersey, would you like to buy it?`)
      return
    }
    if (step === "intent") {
      setStep("back")
      await say(choice.value === "yes" ? "Good. What should the back of the jersey have?" : "No problem. I will still collect the details so we can confirm availability.")
      return
    }
    if (step === "back") {
      setDraft((current) => ({ ...current, backType: choice.value }))
      if (choice.value === "No name") {
        setStep("club")
        await say("No name selected. Which club or country should we look for?")
      } else {
        setStep("name")
        await say(choice.value === "Original name" ? "Which original player name should be on it?" : "Type the custom name you want.")
      }
    }
  }

  async function submitInput() {
    const value = input.trim()
    if (!value) return
    setInput("")
    setMessages((current) => [...current, { id: crypto.randomUUID(), sender: "customer", text: value }])

    if (step === "name") {
      setDraft((current) => ({ ...current, name: value, playerName: value }))
      setStep("number")
      await say("What number should be on the back?")
      return
    }
    if (step === "number") {
      setDraft((current) => ({ ...current, number: value }))
      setStep("club")
      await say("Which club or country is this jersey for?")
      return
    }
    if (step === "club") {
      setDraft((current) => ({ ...current, clubOrCountry: value }))
      setStep("player")
      await say("Which player should we search for? If it is plain, type the main player or type Plain.")
      return
    }
    if (step === "player") {
      setDraft((current) => ({ ...current, playerName: value }))
      setStep("year")
      await say("Which year or season do you want?")
      return
    }
    if (step === "year") {
      const next = { ...draft, year: value }
      setDraft(next)
      const notes = [
        `Requested through assistant.`,
        `Preferred version: ${next.version || "Not selected"}.`,
        `Back option: ${next.backType || "Not selected"}.`,
        next.backType !== "No name" ? `Back name: ${next.name || next.playerName || "Not provided"}.` : "Back name: No name/plain.",
        next.backType !== "No name" ? `Back number: ${next.number || "Not provided"}.` : "",
      ].filter(Boolean).join(" ")
      onUpdate({
        clubOrCountry: next.clubOrCountry,
        playerName: next.playerName || next.name || "Plain",
        number: next.backType === "No name" ? "" : next.number,
        year: next.year,
        notes,
      })
      setReview([
        ["Club / Country", next.clubOrCountry],
        ["Player", next.playerName || next.name || "Plain"],
        ["Year / Season", next.year],
        ["Version", next.version || "Not selected"],
        ["Back", next.backType === "No name" ? "No name / plain" : `${next.name || next.playerName} #${next.number || "not set"}`],
      ])
      setStep("done")
      await say("I filled the request form. Please check it once, attach a reference photo if you have one, then press Send Request.")
    }
  }

  return (
    <AssistantShell title="Jersey Assistant" messages={messages} isTyping={isTyping} done={step === "done"} review={review} submitLabel="Send Request">
      {choices.length > 0 ? (
        <ChoiceGrid choices={choices} onChoose={choose} />
      ) : step !== "done" ? (
        <ChatInput value={input} onChange={setInput} onSubmit={submitInput} placeholder="Type your answer..." />
      ) : (
        <p className="rounded-xl border border-accent/20 bg-accent/10 p-3 text-xs font-bold text-accent">
          Ready to submit.
        </p>
      )}
    </AssistantShell>
  )
}

export function SupportAssistant({
  onUpdate,
  orders = [],
}: {
  onUpdate: (updates: Partial<{ subject: string; message: string }>) => void
  orders?: Array<{ id: string; total?: number; fulfillmentStatus?: string; createdAt?: string }>
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const [step, setStep] = useState<"intro" | "orderId" | "details" | "executive" | "done">("intro")
  const [category, setCategory] = useState("")
  const [input, setInput] = useState("")
  const [review, setReview] = useState<Array<[string, string]>>([])
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    void say("Hi, I can help you open the right support chat. Choose what you need help with.")
  }, [])

  const choices = step === "intro" ? [
    { label: "Order update", value: "Order update" },
    { label: "Payment issue", value: "Payment issue" },
    { label: "Wrong item / size", value: "Wrong item / size" },
    { label: "Talk to executive", value: "Talk to executive" },
    { label: "Something else", value: "Something else" },
  ] : step === "executive" ? [
    { label: "Yes, talk to executive", value: "yes" },
    { label: "No, keep it simple", value: "no" },
  ] : step === "orderId" && orders.length > 0 ? [
    ...orders.slice(0, 5).map((order) => ({
      label: `${order.id} - ${formatOrderStatus(order.fulfillmentStatus)}`,
      value: order.id,
    })),
    { label: "Not sure", value: "Not sure" },
  ] : []

  async function say(text: string) {
    setIsTyping(true)
    await wait(450)
    setMessages((current) => [...current, { id: crypto.randomUUID(), sender: "assistant", text }])
    setIsTyping(false)
  }

  async function choose(choice: Choice) {
    setMessages((current) => [...current, { id: crypto.randomUUID(), sender: "customer", text: choice.label }])

    if (step === "orderId") {
      const subject = "Order update request"
      const order = orders.find((item) => item.id === choice.value)
      const orderText = order ? `${order.id} (${formatOrderStatus(order.fulfillmentStatus)})` : choice.value
      const message = `Customer is asking for an order update. Order: ${orderText}. Please share only customer-safe tracking/status information.`
      onUpdate({ subject, message })
      setReview([
        ["Subject", subject],
        ["Order", orderText],
        ["Message", message],
      ])
      setStep("done")
      await say("I prepared the support chat for that order. Press Start Chat and the team will get it by email.")
      return
    }

    setCategory(choice.value)

    if (step === "executive") {
      if (choice.value === "yes") {
        onUpdate({
          subject: "Executive support request",
          message: "Customer asked to speak with an executive. Please review this support chat and reply directly.",
        })
        setReview([
          ["Subject", "Executive support request"],
          ["Message", "Customer asked to speak with an executive. Please review this support chat and reply directly."],
        ])
        setStep("done")
        await say("Done. I prepared an executive support request. Press Start Chat and it will email the team.")
      } else {
        setStep("details")
        await say("Okay. Tell me the issue in one sentence and I will format it for support.")
      }
      return
    }

    if (choice.value === "Talk to executive") {
      setStep("executive")
      await say("This needs a person from the team. Would you like to talk with an executive?")
      return
    }

    if (choice.value === "Something else") {
      setStep("executive")
      await say("This may need the team to check it manually. Would you like to talk with an executive?")
      return
    }

    if (choice.value.toLowerCase().includes("admin")) {
      onUpdate({
        subject: "Support question about confidential information",
        message: "Customer asked for information that may be confidential. Please review and reply with only what can be safely shared with this customer.",
      })
      setStep("done")
      await say("Sorry, I cannot share confidential details here. I prepared a support chat so the team can reply with only the information allowed for your account.")
      return
    }

    if (choice.value === "Order update") {
      setStep("orderId")
      await say(orders.length > 0 ? "Is it one of these orders? Select the correct order." : "Please enter your order ID if you have it. If not, type Not sure.")
      return
    }

    setStep("details")
    await say("Tell me the main detail in one sentence. I will format it for support.")
  }

  async function submitInput() {
    const value = input.trim()
    if (!value) return
    setInput("")
    setMessages((current) => [...current, { id: crypto.randomUUID(), sender: "customer", text: value }])

    if (isConfidentialRequest(value)) {
      const subject = "Support question about confidential information"
      const message = "Customer asked for information that may be confidential. Please review and reply with only what can be safely shared with this customer."
      onUpdate({ subject, message })
      setReview([
        ["Subject", subject],
        ["Message", message],
      ])
      setStep("done")
      await say("Sorry, I cannot share confidential details here. I prepared a support chat so the team can reply safely.")
      return
    }

    if (step === "orderId") {
      const subject = "Order update request"
      const message = `Customer is asking for an order update. Order ID: ${value}. Please share only customer-safe tracking/status information.`
      onUpdate({ subject, message })
      setReview([
        ["Subject", subject],
        ["Order", value],
        ["Message", message],
      ])
      setStep("done")
      await say("I prepared the support chat. Submit it and the team can reply with the correct customer-safe update.")
      return
    }

    if (step === "details") {
      onUpdate({
        subject: category,
        message: `${category}: ${value}`,
      })
      setReview([
        ["Subject", category],
        ["Message", `${category}: ${value}`],
      ])
      setStep("done")
      await say("I prepared the support chat. Add any proof if needed, then press Start Chat.")
    }
  }

  return (
    <AssistantShell title="Support Assistant" messages={messages} isTyping={isTyping} done={step === "done"} review={review} submitLabel="Start Chat">
      {choices.length > 0 ? (
        <ChoiceGrid choices={choices} onChoose={choose} />
      ) : step !== "done" ? (
        <ChatInput value={input} onChange={setInput} onSubmit={submitInput} placeholder="Type here..." />
      ) : (
        <p className="rounded-xl border border-accent/20 bg-accent/10 p-3 text-xs font-bold text-accent">
          Ready to submit.
        </p>
      )}
    </AssistantShell>
  )
}

function AssistantShell({
  title,
  messages,
  isTyping,
  done,
  review,
  submitLabel,
  children,
}: {
  title: string
  messages: ChatMessage[]
  isTyping: boolean
  done: boolean
  review: Array<[string, string]>
  submitLabel: string
  children: ReactNode
}) {
  const [isOpen, setIsOpen] = useState(true)
  const [rating, setRating] = useState(0)

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-accent/30 bg-background px-4 text-xs font-black uppercase tracking-widest text-accent shadow-sm hover:bg-accent/10"
      >
        <Bot className="h-4 w-4" />
        Open {title}
      </button>
    )
  }

  return (
    <section className="rounded-2xl border border-accent/25 bg-background p-4 shadow-xl ring-4 ring-accent/5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <h2 className="font-black tracking-tight">{title}</h2>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Guided chat</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border hover:bg-secondary"
          aria-label="Close assistant"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="max-h-[360px] space-y-2 overflow-y-auto rounded-xl border border-border bg-secondary/10 p-3">
        {messages.map((message) => (
          <div key={message.id} className={`flex ${message.sender === "customer" ? "justify-end" : "justify-start"}`}>
            <p className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm font-bold leading-relaxed ${message.sender === "customer" ? "bg-foreground text-background" : "border border-border bg-background text-foreground"}`}>
              {message.text}
            </p>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <p className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-xs font-black uppercase tracking-widest text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              typing
            </p>
          </div>
        )}
      </div>
      <div className="mt-3">{children}</div>
      {done && review.length > 0 && (
        <div className="mt-3 rounded-xl border border-accent/30 bg-accent/10 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-accent">Ready to submit</p>
          <div className="mt-2 space-y-2">
            {review.map(([label, value]) => (
              <div key={label} className="rounded-lg border border-accent/20 bg-background/80 p-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
                <p className="mt-1 whitespace-pre-wrap text-xs font-bold">{value || "Not provided"}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs font-black uppercase tracking-widest text-accent">
            ↓ Check this, then press {submitLabel} below.
          </p>
        </div>
      )}
      {done && (
        <div className="mt-3 rounded-xl border border-border bg-secondary/20 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Rate this assistant</p>
          <div className="mt-2 grid grid-cols-5 gap-2">
            {[
              ["1", "Sad"],
              ["2", "Okay"],
              ["3", "Good"],
              ["4", "Great"],
              ["5", "Happy"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setRating(Number(value))}
                className={`rounded-xl border px-2 py-2 text-center text-[10px] font-black uppercase tracking-widest ${rating === Number(value) ? "border-accent bg-accent/10 text-accent" : "border-border hover:bg-secondary"}`}
              >
                <span className="block text-sm">{value}</span>
                {label}
              </button>
            ))}
          </div>
          {rating > 0 && (
            <p className="mt-2 inline-flex items-center gap-2 text-xs font-bold text-accent">
              <Check className="h-4 w-4" />
              Thanks for the feedback.
            </p>
          )}
        </div>
      )}
    </section>
  )
}

function ChoiceGrid({ choices, onChoose }: { choices: Choice[]; onChoose: (choice: Choice) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {choices.map((choice) => (
        <button
          key={choice.value}
          type="button"
          onClick={() => onChoose(choice)}
          className="min-h-10 rounded-xl border border-border px-3 py-2 text-left text-xs font-black uppercase tracking-widest hover:border-accent hover:bg-accent/10"
        >
          {choice.label}
        </button>
      ))}
    </div>
  )
}

function ChatInput({
  value,
  onChange,
  onSubmit,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  placeholder: string
}) {
  return (
    <div className="flex gap-2">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            onSubmit()
          }
        }}
        placeholder={placeholder}
        className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-secondary/30 px-3 text-sm outline-none focus:border-accent"
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={!value.trim()}
        className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-foreground text-background disabled:opacity-50"
        aria-label="Send assistant answer"
      >
        <Send className="h-4 w-4" />
      </button>
    </div>
  )
}

function formatOrderStatus(status?: string) {
  if (status === "out_for_delivery") return "Out for Delivery"
  if (status === "picked_up") return "Picked Up"
  if (status === "shipped") return "In Transit"
  if (status === "packaged") return "Packed"
  if (status === "confirmed") return "Confirmed"
  if (status === "delivered") return "Delivered"
  if (status === "cancelled") return "Cancelled"
  return "Confirmed"
}

function isConfidentialRequest(value: string) {
  return /\b(admin|password|secret|api key|otp|private|confidential|other customer|all orders|bank|token)\b/i.test(value)
}

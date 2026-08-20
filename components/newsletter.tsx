"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ArrowRight, Mail, Sparkles } from "lucide-react"

export function Newsletter() {
  const [email, setEmail] = useState("")
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const submittedEmail = email.trim().toLowerCase()
    if (!submittedEmail) return

    setIsSubmitting(true)
    try {
      const response = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: submittedEmail }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || "Could not subscribe right now.")

      setIsSubmitted(true)
      const { toast } = await import("sonner")
      toast.success("Welcome to the Terrace!", {
        description: `Subscribed successfully with ${submittedEmail}. Get ready for early access drops!`,
        duration: 4000,
      })
      setEmail("")
      setTimeout(() => setIsSubmitted(false), 3000)
    } catch (error) {
      const { toast } = await import("sonner")
      toast.error(error instanceof Error ? error.message : "Could not subscribe right now.", {
        description: "Please try again in a moment.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="relative overflow-hidden py-24 lg:py-32">
      <div className="absolute inset-0 bg-gradient-to-br from-accent via-accent/90 to-accent/80" />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-40 -top-40 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-black/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "32px 32px",
          }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center text-accent-foreground">
          <div className="mb-8 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 shadow-lg backdrop-blur-sm">
            <Mail className="h-7 w-7" />
          </div>

          <h2 className="mb-6 text-5xl font-black tracking-tighter sm:text-6xl lg:text-7xl">
            First Access,<br />
            <span className="font-serif italic">Always</span>
          </h2>

          <p className="mx-auto mb-10 max-w-lg text-lg leading-relaxed text-accent-foreground/80">
            Subscribe for early access to new drops, exclusive releases, and stories from the world of football.
          </p>

          {isSubmitted ? (
            <div className="mx-auto flex max-w-md items-center justify-center gap-3 rounded-2xl bg-white/20 p-6 text-accent-foreground backdrop-blur-sm">
              <Sparkles className="h-5 w-5" />
              <span className="font-bold">Welcome to the terrace!</span>
            </div>
          ) : (
            <form className="mx-auto flex max-w-md flex-col gap-3 sm:flex-row" onSubmit={handleSubmit}>
              <Input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-14 rounded-xl border-white/30 bg-white/20 pl-5 text-base text-accent-foreground placeholder:text-accent-foreground/60 backdrop-blur-sm focus-visible:ring-white/50"
                required
              />
              <Button
                type="submit"
                size="lg"
                disabled={isSubmitting}
                className="h-14 rounded-xl bg-foreground px-8 font-bold text-background shadow-xl transition-all hover:scale-105 hover:bg-foreground/90 hover:shadow-2xl disabled:hover:scale-100"
              >
                {isSubmitting ? "Saving..." : "Subscribe"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </form>
          )}

          <p className="mt-6 text-xs text-accent-foreground/60">
            No spam, ever. Unsubscribe anytime.
          </p>
        </div>
      </div>
    </section>
  )
}

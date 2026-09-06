"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"
import { ArrowRight, Loader2 } from "lucide-react"

export function AuthShell({
  eyebrow,
  title,
  actionHref,
  actionLabel,
  children,
}: {
  eyebrow: string
  title: string
  actionHref: string
  actionLabel: string
  children: ReactNode
}) {
  return (
    <main className="min-h-screen bg-[#070405] text-white">
      <div className="sticky top-0 z-40 border-b border-red-950/60 bg-[#080506]/95 text-white backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="text-xl font-black tracking-tight transition-colors hover:text-red-300">
            terrace<span className="text-red-600">.</span>fc
          </Link>
          <Link href={actionHref} className="rounded-lg border border-red-300/65 bg-red-600 px-3 py-2 text-xs font-black uppercase tracking-widest text-white shadow-[0_0_18px_rgba(220,38,38,0.24)] transition hover:bg-red-500">
            {actionLabel}
          </Link>
        </div>
      </div>
      <section className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center overflow-hidden px-4 py-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(220,38,38,0.32),transparent_34%),linear-gradient(135deg,#070405_0%,#160809_48%,#050303_100%)]" />
        <div className="absolute inset-x-0 top-0 h-px bg-red-500/50" />
        <div className="relative w-full max-w-xl rounded-3xl border border-white/10 bg-black/70 p-5 shadow-2xl shadow-black/40 backdrop-blur sm:p-8">
          <p className="text-center text-xs font-black uppercase tracking-[0.28em] text-red-300">{eyebrow}</p>
          <h1 className="mb-6 mt-2 text-center text-4xl font-black tracking-tight sm:text-5xl">{title}</h1>
          <div className="min-h-[360px]">{children}</div>
        </div>
      </section>
    </main>
  )
}

export function AuthInput({
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  autoComplete,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  inputMode?: "text" | "numeric" | "email" | "tel"
  autoComplete?: string
}) {
  return (
    <label className="block space-y-2">
      <span className="text-[10px] font-black uppercase tracking-[0.22em] text-white/60">{label}</span>
      <input
        value={value}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        className="h-13 w-full rounded-2xl border border-white/15 bg-white/8 px-4 text-base font-bold text-white outline-none transition placeholder:text-white/30 focus:border-red-400 focus:bg-white/12"
      />
    </label>
  )
}

export function AuthButton({ loading, label }: { loading: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-red-600 text-sm font-black uppercase tracking-widest text-white transition hover:bg-white hover:text-black disabled:opacity-60"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
      {label}
    </button>
  )
}

export function AuthLoading({ label }: { label: string }) {
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 text-sm font-black uppercase tracking-widest text-red-200">
      <Loader2 className="h-6 w-6 animate-spin" />
      {label}
    </div>
  )
}

export function AuthNotice({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-red-500/30 bg-red-950/30 p-5 text-center">
      <p className="text-sm font-black uppercase tracking-widest text-red-200">{title}</p>
      <p className="mt-2 text-sm text-white/70">{text}</p>
    </div>
  )
}

export function AuthError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="rounded-2xl border border-red-500/25 bg-red-950/30 px-4 py-3 text-sm font-bold text-red-100">{message}</p>
}

export function MethodDivider({ label = "Different methods" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="h-px flex-1 bg-white/15" />
      <span className="text-[10px] font-black uppercase tracking-[0.24em] text-white/45">{label}</span>
      <span className="h-px flex-1 bg-white/15" />
    </div>
  )
}

export function cleanIndianPhoneDigits(value: string) {
  let digits = value.replace(/\D/g, "")
  if (digits.length > 10 && digits.startsWith("91")) digits = digits.slice(2)
  return digits.slice(0, 10)
}

export function toIndianPhone(value: string) {
  const digits = cleanIndianPhoneDigits(value)
  if (!/^[6-9]\d{9}$/.test(digits)) return ""
  return `+91${digits}`
}

export function GoogleButton({
  mode,
  disabled,
  email = "",
}: {
  mode: "signin" | "signup"
  disabled?: boolean
  email?: string
}) {
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const continueWithGoogle = async () => {
    setError("")
    setIsLoading(true)
    const redirectTarget = typeof window === "undefined"
      ? "/"
      : getAuthRedirectTarget(new URLSearchParams(window.location.search))
    const emailQuery = email.trim() ? `&email=${encodeURIComponent(email.trim())}` : ""
    window.location.href = `/api/auth/google?redirect_url=${encodeURIComponent(redirectTarget)}${emailQuery}`
  }

  return (
    <div className="space-y-2">
      <button
      type="button"
        disabled={disabled || isLoading}
        onClick={continueWithGoogle}
        className="flex h-16 w-full items-center justify-center gap-3 rounded-2xl border border-red-400/35 bg-white/[0.07] text-sm font-black uppercase tracking-widest text-white shadow-[0_12px_30px_rgba(0,0,0,0.24)] transition hover:border-red-300 hover:bg-red-950/45 disabled:opacity-60"
      >
        {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-red-300" /> : <span className="flex h-8 w-8 items-center justify-center rounded-full border border-red-400/70 bg-[#080506] text-base font-black text-red-300 shadow-[0_0_0_3px_rgba(220,38,38,0.12)]">G</span>}
        {mode === "signup" ? "Sign Up With Google" : "Continue With Google"}
      </button>
      <AuthError message={error} />
    </div>
  )
}

export function getAuthRedirectTarget(searchParams?: URLSearchParams | ReadonlyURLSearchParamsLike | null) {
  const fromQuery = searchParams?.get("redirect_url") || searchParams?.get("redirect") || ""
  const fromQueryTarget = sanitizeAuthRedirect(fromQuery)
  if (fromQueryTarget) return fromQueryTarget

  if (typeof window === "undefined") return "/"

  try {
    const stored = window.sessionStorage.getItem("terrace_auth_redirect")
    const storedTarget = sanitizeAuthRedirect(stored || "")
    if (storedTarget) return storedTarget

    const referrer = document.referrer ? new URL(document.referrer) : null
    if (referrer && referrer.origin === window.location.origin) {
      const target = sanitizeAuthRedirect(`${referrer.pathname}${referrer.search}${referrer.hash}`)
      if (target) return target
    }
  } catch {
    return "/"
  }

  return "/"
}

export function getAuthRedirectQuery(searchParams?: URLSearchParams | ReadonlyURLSearchParamsLike | null) {
  const target = getAuthRedirectTarget(searchParams)
  return target && target !== "/" ? `?redirect_url=${encodeURIComponent(target)}` : ""
}

function sanitizeAuthRedirect(value: string) {
  if (!value) return ""
  try {
    if (value.startsWith("http")) {
      if (typeof window === "undefined") return ""
      const parsed = new URL(value)
      if (parsed.origin !== window.location.origin) return ""
      value = `${parsed.pathname}${parsed.search}${parsed.hash}`
    }
  } catch {
    return ""
  }

  if (!value.startsWith("/")) return ""
  if (value.startsWith("//")) return ""
  if (value.startsWith("/login") || value.startsWith("/signup") || value.startsWith("/auth/")) return ""
  return value
}

type ReadonlyURLSearchParamsLike = {
  get(name: string): string | null
}

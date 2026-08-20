"use client"

import { FormEvent, Suspense, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { saveCustomer } from "@/lib/customer-auth"
import { AuthButton, AuthError, AuthInput, AuthLoading, AuthShell, GoogleButton, getAuthRedirectQuery, getAuthRedirectTarget } from "@/components/customer-auth-ui"

export default function SignupPage() {
  return (
    <Suspense fallback={<AuthShell eyebrow="Sign Up" title="Create Account" actionHref="/login" actionLabel="Login"><AuthLoading label="Loading secure signup" /></AuthShell>}>
      <SignupContent />
    </Suspense>
  )
}

function SignupContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [email, setEmail] = useState(() => searchParams.get("email") || "")
  const [phone, setPhone] = useState("")
  const [name, setName] = useState("")
  const [message, setMessage] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const googlePending = searchParams.get("google_pending") === "1"
  const redirectQuery = getAuthRedirectQuery(searchParams)
  const error = searchParams.get("error")

  const register = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage("")
    setIsSaving(true)
    try {
      const response = await fetch("/api/customer/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, phone, name }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.customer) throw new Error(data?.error || "Could not create your account.")
      saveCustomer(data.customer)
      router.push(getAuthRedirectTarget(searchParams))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create your account.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <AuthShell eyebrow="Sign Up" title="Create Account" actionHref={`/login${redirectQuery}`} actionLabel="Login">
      <div className="w-full space-y-5">
        <p className="text-center text-sm font-bold leading-6 text-white/65">{googlePending ? "Your Google email is ready. Add your phone number and name to finish registration." : "Add your email, phone number, and name to create your account."}</p>
        {!googlePending && <GoogleButton mode="signup" email={email} />}
        <form onSubmit={register} className="space-y-3">
          <AuthInput label="Email address" value={email} onChange={setEmail} type="email" inputMode="email" autoComplete="email" />
          <AuthInput label="Phone number" value={phone} onChange={(value) => setPhone(value.replace(/\D/g, "").slice(0, 10))} type="tel" inputMode="tel" autoComplete="tel" />
          <AuthInput label="Full name" value={name} onChange={setName} autoComplete="name" />
          <AuthButton loading={isSaving} label="Create Account" />
        </form>
        <AuthError message={message || (error ? decodeAuthError(error) : undefined)} />
        <p className="text-center text-xs font-bold text-white/55">
          Already have an account? <Link href={`/login${redirectQuery}`} className="font-black text-red-300 hover:text-white">Login</Link>
        </p>
      </div>
    </AuthShell>
  )
}

function decodeAuthError(error: string) {
  if (error === "google_state") return "Your Google login expired. Please try again."
  if (error === "google_not_configured") return "Google login is not configured yet."
  try {
    return decodeURIComponent(error.replace(/\+/g, " "))
  } catch {
    return "Google login failed. Please try again."
  }
}

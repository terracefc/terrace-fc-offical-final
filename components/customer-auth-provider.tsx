"use client"

import Link from "next/link"
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react"
import { Loader2, Mail, X } from "lucide-react"
import { clearCustomer, CUSTOMER_AUTH_EVENT, loginCustomerWithPassword, readCustomer, saveCustomer, type CustomerAccount } from "@/lib/customer-auth"

type CustomerAuthContextValue = {
  customer: CustomerAccount | null
  isLoaded: boolean
  isSignedIn: boolean
  openLogin: (redirectTo?: string) => void
  closeLogin: () => void
  logout: () => void
}

const CustomerAuthContext = createContext<CustomerAuthContextValue | null>(null)

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<CustomerAccount | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [redirectTo, setRedirectTo] = useState("/profile")

  useEffect(() => {
    const syncCustomer = () => setCustomer(readCustomer())
    syncCustomer()
    setIsLoaded(true)
    window.addEventListener(CUSTOMER_AUTH_EVENT, syncCustomer)
    window.addEventListener("storage", syncCustomer)
    return () => {
      window.removeEventListener(CUSTOMER_AUTH_EVENT, syncCustomer)
      window.removeEventListener("storage", syncCustomer)
    }
  }, [])

  const openLogin = useCallback((target = "/profile") => {
    setRedirectTo(sanitizeRedirect(target))
    setIsOpen(true)
  }, [])
  const closeLogin = useCallback(() => setIsOpen(false), [])
  const logout = useCallback(() => {
    clearCustomer()
    setCustomer(null)
  }, [])
  const value = useMemo(() => ({ customer, isLoaded, isSignedIn: Boolean(customer), openLogin, closeLogin, logout }), [customer, isLoaded, openLogin, closeLogin, logout])

  return (
    <CustomerAuthContext.Provider value={value}>
      {children}
      <EmailLoginModal open={isOpen} redirectTo={redirectTo} onClose={closeLogin} onComplete={(account) => {
        saveCustomer(account)
        setCustomer(account)
      }} />
    </CustomerAuthContext.Provider>
  )
}

export function useCustomerAuth() {
  const value = useContext(CustomerAuthContext)
  if (!value) throw new Error("useCustomerAuth must be used inside CustomerAuthProvider")
  return value
}

function EmailLoginModal({
  open,
  redirectTo,
  onClose,
  onComplete,
}: {
  open: boolean
  redirectTo: string
  onClose: () => void
  onComplete: (customer: CustomerAccount) => void
}) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) {
      setPassword("")
      setMessage("")
    }
  }, [open])

  if (!open) return null

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage("")
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setMessage("Enter a valid email address.")
    if (!password) return setMessage("Enter your password.")

    setLoading(true)
    try {
      const customer = await loginCustomerWithPassword(email, password)
      onComplete(customer)
      onClose()
      window.location.assign(redirectTo)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not sign in.")
    } finally {
      setLoading(false)
    }
  }

  const continueWithGoogle = () => {
    window.location.assign(`/api/auth/google?redirect_url=${encodeURIComponent(redirectTo)}`)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Customer login">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close login" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-[28px] border border-white/15 bg-[#100809] p-6 text-white shadow-2xl shadow-black/60 sm:p-8">
        <button type="button" onClick={onClose} className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 hover:bg-white/10" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
        <div className="mb-7 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-600/20 text-red-300"><Mail className="h-6 w-6" /></div>
        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-red-300">terrace.fc</p>
        <h2 className="mt-2 text-3xl font-black tracking-tight">Sign in</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/60">Use your email and password, or continue with Google.</p>

        <form onSubmit={signIn} className="mt-7 space-y-4">
          <label className="block space-y-2"><span className="text-[10px] font-black uppercase tracking-[0.22em] text-white/60">Email address</span><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" className="h-13 w-full rounded-2xl border border-white/15 bg-white/8 px-4 text-base font-bold text-white outline-none focus:border-red-400" /></label>
          <label className="block space-y-2"><span className="text-[10px] font-black uppercase tracking-[0.22em] text-white/60">Password</span><input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" className="h-13 w-full rounded-2xl border border-white/15 bg-white/8 px-4 text-base font-bold text-white outline-none focus:border-red-400" /></label>
          <button type="submit" disabled={loading} className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-red-600 text-sm font-black uppercase tracking-widest transition hover:bg-white hover:text-black disabled:opacity-60">{loading && <Loader2 className="h-4 w-4 animate-spin" />}Sign in</button>
        </form>
        <div className="my-5 flex items-center gap-3"><span className="h-px flex-1 bg-white/15" /><span className="text-[10px] font-black uppercase tracking-[0.24em] text-white/45">or</span><span className="h-px flex-1 bg-white/15" /></div>
        <button type="button" onClick={continueWithGoogle} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white text-sm font-black uppercase tracking-widest text-black transition hover:bg-red-100"><Mail className="h-4 w-4" />Continue with Google</button>
        {message && <p className="mt-4 rounded-2xl border border-red-500/25 bg-red-950/35 px-4 py-3 text-sm font-bold text-red-100">{message}</p>}
        <p className="mt-5 text-center text-sm text-white/60">New here? <Link href={`/signup?redirect_url=${encodeURIComponent(redirectTo)}`} onClick={onClose} className="font-black text-red-300 hover:text-white">Create an account</Link></p>
      </div>
    </div>
  )
}

function sanitizeRedirect(value: string) {
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/login") && !value.startsWith("/signup") && !value.startsWith("/auth/") ? value : "/profile"
}

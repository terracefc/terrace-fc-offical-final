"use client"

import { FormEvent, Suspense, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { saveCustomer } from "@/lib/customer-auth"
import { AuthButton, AuthError, AuthInput, AuthLoading, AuthShell, GoogleButton, getAuthRedirectQuery, getAuthRedirectTarget } from "@/components/customer-auth-ui"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthShell eyebrow="Login" title="Customer Login" actionHref="/signup" actionLabel="Create Account"><AuthLoading label="Loading secure login" /></AuthShell>}>
      <LoginContent />
    </Suspense>
  )
}

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState("")
  const [otp, setOtp] = useState("")
  const [otpSent, setOtpSent] = useState(false)
  const [profileStep, setProfileStep] = useState<"name" | null>(null)
  const [fullName, setFullName] = useState("")
  const [isChecking, setIsChecking] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [message, setMessage] = useState("")
  const redirectQuery = getAuthRedirectQuery(searchParams)
  const error = searchParams.get("error")

  const checkEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedEmail = email.trim().toLowerCase()
    setMessage("")
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setMessage("Enter a valid email address.")
      return
    }

    setIsChecking(true)
    try {
      const otpResponse = await fetch("/api/customer/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      })
      const otpData = await otpResponse.json().catch(() => null)
      if (!otpResponse.ok) throw new Error(otpData?.error || "Could not send the verification code.")
      setEmail(normalizedEmail)
      setOtpSent(true)
      setMessage("We sent a 6-digit verification code to your email.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not check this account.")
    } finally {
      setIsChecking(false)
    }
  }

  const verifyOtp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!/^\d{6}$/.test(otp.trim())) {
      setMessage("Enter the 6-digit verification code.")
      return
    }

    setIsVerifying(true)
    setMessage("")
    try {
      const response = await fetch("/api/customer/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: otp.trim() }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || "The verification code is incorrect.")
      if (data?.requiresProfile) {
        setOtpSent(false)
        setProfileStep("name")
        setMessage("")
        return
      }
      if (!data?.customer) throw new Error(data?.error || "The verification code is incorrect.")
      saveCustomer(data.customer)
      router.push(getAuthRedirectTarget(searchParams))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The verification code is incorrect.")
    } finally {
      setIsVerifying(false)
    }
  }

  const saveProfileStep = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage("")
    setIsSavingProfile(true)
    try {
      if (profileStep === "name") {
        if (fullName.trim().length < 2) throw new Error("Enter your full name.")
        const response = await fetch("/api/customer/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim().toLowerCase(), name: fullName.trim(), phone: "" }),
        })
        const data = await response.json().catch(() => null)
        if (!response.ok || !data?.customer) throw new Error(data?.error || "Could not save your name.")
        saveCustomer(data.customer)
        router.push(getAuthRedirectTarget(searchParams))
        return
      }

    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save your details.")
    } finally {
      setIsSavingProfile(false)
    }
  }

  return (
    <AuthShell eyebrow="Login" title="Customer Login" actionHref={`/signup${redirectQuery}`} actionLabel="Create Account">
      <div className="w-full space-y-5">
        <p className="text-center text-sm font-bold leading-6 text-white/65">Continue with Google, or type your email below to receive a secure verification code.</p>
        <GoogleButton mode="signin" email={email} />
        {profileStep ? (
          <form onSubmit={saveProfileStep} className="space-y-3">
            <div className="rounded-xl border border-white/15 bg-white/5 p-3 text-xs font-bold leading-relaxed text-white/65">
              Your email is verified. Add your name so we can personalise your order and cart updates. Your mobile number is only needed at checkout.
            </div>
            <AuthInput label="Full name" value={fullName} onChange={setFullName} autoComplete="name" autoFocus />
            <AuthButton loading={isSavingProfile} label="Save & Continue" />
          </form>
        ) : !otpSent ? (
          <form onSubmit={checkEmail} className="space-y-3">
            <AuthInput label="Email address" value={email} onChange={setEmail} type="email" inputMode="email" autoComplete="email" />
            {email.trim() && <AuthButton loading={isChecking} label="Continue" />}
          </form>
        ) : (
          <form onSubmit={verifyOtp} className="space-y-3">
            <div className="space-y-2">
              <label htmlFor="verification-code" className="block text-xs font-black uppercase tracking-[0.22em] text-white/70">Verification code</label>
              <InputOTP
                id="verification-code"
                maxLength={6}
                value={otp}
                onChange={(value) => setOtp(value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                aria-label="6 digit verification code"
                containerClassName="w-full"
              >
                <InputOTPGroup className="w-full justify-between gap-2 sm:gap-3">
                  {Array.from({ length: 6 }, (_, index) => (
                    <InputOTPSlot
                      key={index}
                      index={index}
                      className="h-14 min-w-0 flex-1 rounded-xl border border-white/25 bg-white/5 text-xl font-black text-white shadow-none first:rounded-xl first:border-l last:rounded-xl data-[active=true]:border-red-400 data-[active=true]:bg-red-400/10 data-[active=true]:shadow-[0_0_0_3px_rgba(248,113,113,0.22),0_0_18px_rgba(248,113,113,0.36)] data-[active=true]:animate-pulse"
                    />
                  ))}
                </InputOTPGroup>
              </InputOTP>
              <p className="text-xs font-medium text-white/50">Enter the code one number at a time. The glowing box shows where to type next.</p>
            </div>
            <AuthButton loading={isVerifying} label="Verify Code" />
          </form>
        )}
        <AuthError message={message || (error ? decodeAuthError(error) : undefined)} />
        <p className="text-center text-xs font-bold text-white/55">
          New here? <Link href={`/signup${redirectQuery}`} className="font-black text-red-300 hover:text-white">Create an account</Link>
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

"use client"

import { FormEvent, Suspense, useEffect, useState } from "react"
import { ClerkFailed, ClerkLoaded, ClerkLoading, useAuth, useSignIn } from "@clerk/nextjs"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  AuthButton,
  AuthError,
  AuthInput,
  AuthLoading,
  AuthNotice,
  AuthShell,
  OtpInput,
  cleanIndianPhoneDigits,
  getAuthRedirectQuery,
  getAuthRedirectTarget,
  readClerkError,
  toIndianPhone,
} from "@/components/customer-auth-ui"

type LoginStep = "identifier" | "email-code" | "sms-code" | "mfa-code"

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginShellFallback />}>
      <LoginPageContent />
    </Suspense>
  )
}

function LoginPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isLoaded, isSignedIn } = useAuth()
  const redirectQuery = getAuthRedirectQuery(searchParams)

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    const requestedTarget = getAuthRedirectTarget(searchParams)
    router.replace(requestedTarget === "/" ? "/profile" : requestedTarget)
  }, [isLoaded, isSignedIn, router, searchParams])

  if (isLoaded && isSignedIn) {
    return (
      <AuthShell eyebrow="Account" title="Opening Your Profile" actionHref="/profile" actionLabel="Profile">
        <AuthLoading label="You are already logged in" />
      </AuthShell>
    )
  }

  return (
    <AuthShell eyebrow="Login" title="Customer Login" actionHref={`/signup${redirectQuery}`} actionLabel="Create Account">
      <ClerkLoading>
        <AuthLoading label="Loading secure login" />
      </ClerkLoading>
      <ClerkFailed>
        <AuthNotice title="Login is loading" text="Refresh once and try again." />
      </ClerkFailed>
      <ClerkLoaded>
        <LoginForm />
      </ClerkLoaded>
    </AuthShell>
  )
}

function LoginShellFallback() {
  return (
    <AuthShell eyebrow="Login" title="Customer Login" actionHref="/signup" actionLabel="Create Account">
      <AuthLoading label="Loading secure login" />
    </AuthShell>
  )
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { signIn, fetchStatus, errors } = useSignIn()
  const [identifier, setIdentifier] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [code, setCode] = useState("")
  const [step, setStep] = useState<LoginStep>("identifier")
  const [message, setMessage] = useState("")
  const [lookupLoading, setLookupLoading] = useState(false)
  const [isCompleting, setIsCompleting] = useState(false)
  const isLoading = fetchStatus === "fetching" || lookupLoading || isCompleting

  const normalizedIdentifier = () => {
    const trimmed = identifier.trim()
    if (/^\S+@\S+\.\S+$/.test(trimmed)) return { kind: "email", value: trimmed.toLowerCase() }
    const normalizedPhone = toIndianPhone(trimmed)
    if (normalizedPhone) return { kind: "phone", value: normalizedPhone }
    return null
  }

  const finish = async () => {
    setIsCompleting(true)
    try {
      const finalizeResult = await signIn.finalize({
        navigate: ({ session, decorateUrl }) => {
          const requestedTarget = getAuthRedirectTarget(searchParams)
          const destination = session?.currentTask
            ? `/login/tasks/${session.currentTask.key}`
            : requestedTarget === "/" ? "/profile" : requestedTarget
          window.location.assign(decorateUrl(destination))
        },
      })
      if (finalizeResult.error) {
        setMessage(readClerkError(finalizeResult.error, "Login completed, but the session could not be opened."))
        setIsCompleting(false)
      }
    } catch (error) {
      setMessage(readClerkError(error, "Login completed, but the session could not be opened."))
      setIsCompleting(false)
    }
  }

  const completeVerifiedFactor = async () => {
    if (signIn.status === "complete") {
      await finish()
      return
    }
    if (signIn.status === "needs_second_factor") {
      const result = await signIn.mfa.sendPhoneCode()
      if (result.error) {
        setMessage(readClerkError(result.error, "Your email was verified, but the second login code could not be sent."))
        return
      }
      setCode("")
      setStep("mfa-code")
      setMessage("Email verified. Enter the security code sent to your mobile number.")
      return
    }
    setMessage(`The code was accepted, but login is waiting for another requirement (${signIn.status}). Please try again.`)
  }

  const checkAccount = async (event: FormEvent) => {
    event.preventDefault()
    setMessage("")
    const normalized = normalizedIdentifier()
    if (!normalized) {
      setMessage("Enter your email or 10 digit mobile number.")
      return
    }

    setLookupLoading(true)
    try {
      const params = new URLSearchParams({ identifier: normalized.value })
      const response = await fetch(`/api/auth/lookup?${params.toString()}`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Could not check this account.")

      if (!data.exists) {
        const signupParams = new URLSearchParams()
        if (normalized.kind === "email") signupParams.set("email", normalized.value)
        else signupParams.set("phone", cleanIndianPhoneDigits(normalized.value))
        const redirectTarget = getAuthRedirectTarget(searchParams)
        if (redirectTarget !== "/") signupParams.set("redirect_url", redirectTarget)
        router.push(`/signup?${signupParams.toString()}`)
        return
      }

      // Start a clean Clerk attempt here. A sign-in ID left over from an older
      // OTP screen can otherwise be submitted after Clerk has invalidated it.
      await signIn.reset()
      if (normalized.kind === "email") await sendEmailCode(normalized.value)
      else await sendSmsCode(normalized.value)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not check this account.")
    } finally {
      setLookupLoading(false)
    }
  }

  const sendEmailCode = async (target = email || identifier) => {
    setMessage("")
    const normalizedEmail = target.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setMessage("Enter a valid email address.")
      return
    }
    const result = await signIn.emailCode.sendCode({ emailAddress: normalizedEmail })
    if (result.error) {
      setMessage(readClerkError(result.error, "Could not send the login code. Check the email and try again."))
      return
    }
    setEmail(normalizedEmail)
    setIdentifier(normalizedEmail)
    setCode("")
    setStep("email-code")
  }

  const verifyEmailCode = async (event: FormEvent) => {
    event.preventDefault()
    setMessage("")
    const result = await signIn.emailCode.verifyCode({ code: code.trim() })
    if (result.error) {
      setMessage(readClerkError(result.error, "That code did not work. Try again."))
      return
    }
    await completeVerifiedFactor()
  }

  const sendSmsCode = async (target = phone || identifier) => {
    setMessage("")
    const normalizedPhone = toIndianPhone(target)
    if (!normalizedPhone) {
      setMessage("Enter a valid 10 digit mobile number.")
      return
    }
    const result = await signIn.phoneCode.sendCode({ phoneNumber: normalizedPhone })
    if (result.error) {
      setMessage(readClerkError(result.error, "We could not send an SMS code for this number. Check the number or create an account first."))
      return
    }
    setPhone(cleanIndianPhoneDigits(normalizedPhone))
    setIdentifier(cleanIndianPhoneDigits(normalizedPhone))
    setCode("")
    setStep("sms-code")
  }

  const verifySmsCode = async (event: FormEvent) => {
    event.preventDefault()
    setMessage("")
    const result = await signIn.phoneCode.verifyCode({ code: code.trim() })
    if (result.error) {
      setMessage(readClerkError(result.error, "That SMS code did not work. Try again."))
      return
    }
    await completeVerifiedFactor()
  }

  const verifyMfaCode = async (event: FormEvent) => {
    event.preventDefault()
    setMessage("")
    const result = await signIn.mfa.verifyPhoneCode({ code: code.trim() })
    if (result.error) {
      setMessage(readClerkError(result.error, "That security code did not work. Try again."))
      return
    }
    if (signIn.status !== "complete") {
      setMessage(`The code was accepted, but login is not complete yet (${signIn.status}).`)
      return
    }
    await finish()
  }

  return (
    <div className="w-full space-y-5">
      {step === "identifier" && (
        <form onSubmit={checkAccount} className="space-y-4">
          <AuthInput label="Email or mobile number" value={identifier} onChange={setIdentifier} autoComplete="username" />
          <AuthButton loading={isLoading} label="Login" />
        </form>
      )}

      {step === "email-code" && (
        <form onSubmit={verifyEmailCode} className="space-y-4">
          <AuthNotice title="Email code sent" text={`Enter the 6 digit code sent to ${email}. It expires after 10 minutes.`} />
          <OtpInput label="6 digit email code" value={code} onChange={setCode} />
          <AuthButton loading={isLoading} label="Login" />
          <button type="button" onClick={() => sendEmailCode()} className="w-full text-xs font-black uppercase tracking-widest text-white/55 hover:text-red-200">
            Send another code
          </button>
        </form>
      )}

      {step === "sms-code" && (
        <form onSubmit={verifySmsCode} className="space-y-4">
          <AuthNotice title="terrace.fc login OTP" text={`Enter the 6 digit code sent by SMS to +91 ${phone}. It expires after 10 minutes.`} />
          <OtpInput label="6 digit SMS code" value={code} onChange={setCode} />
          <AuthButton loading={isLoading} label="Login" />
          <button type="button" onClick={() => sendSmsCode()} className="w-full text-xs font-black uppercase tracking-widest text-white/55 hover:text-red-200">
            Send another code
          </button>
        </form>
      )}

      {step === "mfa-code" && (
        <form onSubmit={verifyMfaCode} className="space-y-4">
          <AuthNotice title="Security check" text="Your email is verified. Enter the 6 digit security code sent to your mobile number." />
          <OtpInput label="6 digit security code" value={code} onChange={setCode} />
          <AuthButton loading={isLoading} label="Finish Login" />
          <button type="button" onClick={() => signIn.mfa.sendPhoneCode()} className="w-full text-xs font-black uppercase tracking-widest text-white/55 hover:text-red-200">
            Send another code
          </button>
        </form>
      )}

      <AuthError message={message || readClerkError(errors?.global?.[0] || errors?.raw?.[0], "")} />
      <p className="text-center text-xs font-bold text-white/55">
        New here? <Link href={`/signup${getAuthRedirectQuery(searchParams)}`} className="font-black text-red-300 hover:text-white">Create an account</Link>
      </p>
    </div>
  )
}

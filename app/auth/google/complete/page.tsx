"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { saveCustomer, type CustomerAccount } from "@/lib/customer-auth"

export default function GoogleCompletePage() {
  const router = useRouter()
  const [message, setMessage] = useState("Finishing Google login...")
  const [customer, setCustomer] = useState<CustomerAccount | null>(null)

  const getRedirectTarget = () => {
    const params = new URLSearchParams(window.location.search)
    const target = params.get("redirect_url") || "/"
    if (!target.startsWith("/") || target.startsWith("//") || target.startsWith("/login") || target.startsWith("/signup") || target.startsWith("/auth/")) return "/"
    return target
  }

  useEffect(() => {
    async function completeLogin() {
      try {
        const response = await fetch("/api/auth/google/session", { cache: "no-store" })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "Google login expired.")

        const nextCustomer = data.customer as CustomerAccount
        saveCustomer(nextCustomer)
        router.replace(getRedirectTarget())
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Google login failed.")
      }
    }

    completeLogin()
  }, [router])

  return (
    <main className="min-h-screen bg-background text-foreground noise-texture">
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        {!customer && <Loader2 className="mx-auto h-8 w-8 animate-spin text-accent" />}
        <h1 className="mt-5 text-3xl font-black tracking-tight">Google Login</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        {!customer && !message.includes("Finishing") && (
          <Button asChild className="mt-6 bg-foreground text-background">
            <Link href="/login">Back to Login</Link>
          </Button>
        )}
      </div>
    </main>
  )
}

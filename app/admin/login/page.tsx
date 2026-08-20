"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Lock } from "lucide-react"

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<LoginShell />}>
      <AdminLoginForm />
    </Suspense>
  )
}

function AdminLoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get("next") || "/admin"
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    setLoading(true)

    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    })

    setLoading(false)

    if (!response.ok) {
      setError("Wrong password.")
      return
    }

    router.replace(next)
    router.refresh()
  }

  return (
    <main className="min-h-screen bg-background text-foreground noise-texture flex items-center justify-center px-4">
      <div className="w-full max-w-sm border border-border bg-background/90 shadow-2xl rounded-2xl p-6">
        <div className="w-12 h-12 rounded-2xl bg-foreground text-background flex items-center justify-center mb-5">
          <Lock className="w-5 h-5" />
        </div>
        <p className="text-xs font-black uppercase tracking-widest text-accent mb-2">Private Access</p>
        <h1 className="text-3xl font-black tracking-tight mb-2">Admin Login</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Manage orders and store operations.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="password" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full h-12 rounded-xl border border-border bg-secondary/40 px-4 outline-none focus:border-accent"
              autoFocus
            />
          </div>
          {error && <p className="text-sm font-bold text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full h-12 rounded-xl bg-foreground text-background text-sm font-black uppercase tracking-wider disabled:opacity-50"
          >
            {loading ? "Checking..." : "Enter Admin"}
          </button>
        </form>

        <Link href="/" className="block text-center text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-accent mt-6">
          Back to Store
        </Link>
      </div>
    </main>
  )
}

function LoginShell() {
  return (
    <main className="min-h-screen bg-background text-foreground noise-texture flex items-center justify-center px-4">
      <div className="w-full max-w-sm border border-border bg-background/90 shadow-2xl rounded-2xl p-6">
        <div className="w-12 h-12 rounded-2xl bg-foreground text-background flex items-center justify-center mb-5">
          <Lock className="w-5 h-5" />
        </div>
        <p className="text-xs font-black uppercase tracking-widest text-accent mb-2">Private Access</p>
        <h1 className="text-3xl font-black tracking-tight mb-2">Admin Login</h1>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </main>
  )
}

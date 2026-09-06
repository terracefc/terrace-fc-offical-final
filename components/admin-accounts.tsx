"use client"

import { useEffect, useState } from "react"
import { Loader2, RefreshCw, UsersRound } from "lucide-react"
import { fetchCustomerAccounts, type CustomerAccount } from "@/lib/customer-auth"
import type { NewsletterSubscriber } from "@/lib/newsletter"

export function AdminAccounts() {
  const [accounts, setAccounts] = useState<CustomerAccount[]>([])
  const [subscribers, setSubscribers] = useState<NewsletterSubscriber[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")

  const syncAccounts = async () => {
    setIsLoading(true)
    setError("")
    try {
      const [nextAccounts, nextSubscribers] = await Promise.all([
        fetchCustomerAccounts(),
        fetch("/api/newsletter").then((response) => response.ok ? response.json() : null).then((data) => Array.isArray(data?.subscribers) ? data.subscribers as NewsletterSubscriber[] : []),
      ])
      setAccounts(nextAccounts)
      setSubscribers(nextSubscribers)
    } catch (error) {
      setError(error instanceof Error ? error.message : "Customer accounts could not be loaded.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    syncAccounts()
    const interval = window.setInterval(() => {
      fetchCustomerAccounts().then(setAccounts).catch(() => null)
      fetch("/api/newsletter")
        .then((response) => response.ok ? response.json() : null)
        .then((data) => {
          if (Array.isArray(data?.subscribers)) setSubscribers(data.subscribers)
        })
        .catch(() => null)
    }, 15000)
    window.addEventListener("focus", syncAccounts)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener("focus", syncAccounts)
    }
  }, [])

  return (
    <div className="border border-border rounded-2xl bg-background/85 p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <UsersRound className="w-5 h-5 text-accent" />
          <h2 className="font-black text-xl tracking-tight">Customer Accounts</h2>
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-black text-accent">{accounts.length}</span>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-black text-muted-foreground">{subscribers.length} drop emails</span>
        </div>
        <button
          type="button"
          onClick={syncAccounts}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-border px-3 text-xs font-black uppercase tracking-widest hover:bg-secondary"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
          Loading customer accounts...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-sm font-bold text-red-600">
          {error}
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
          No customer accounts yet. Accounts created through Sign Up or Login will appear here.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-muted-foreground">
              <tr className="text-left">
                <th className="px-4 py-3 font-black uppercase tracking-widest text-[10px]">Name</th>
                <th className="px-4 py-3 font-black uppercase tracking-widest text-[10px]">Phone</th>
                <th className="px-4 py-3 font-black uppercase tracking-widest text-[10px]">Email</th>
                <th className="px-4 py-3 font-black uppercase tracking-widest text-[10px]">Customer ID</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id} className="border-t border-border/60">
                  <td className="px-4 py-3 font-black">{account.name}</td>
                  <td className="px-4 py-3">{account.phone}</td>
                  <td className="px-4 py-3">{account.email}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{account.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-5 rounded-xl border border-border bg-secondary/20 p-4">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-black tracking-tight">Drop Email List</h3>
            <p className="text-xs text-muted-foreground">Use these emails for new drop/custom email campaigns.</p>
          </div>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText([...new Set([...accounts.map((account) => account.email), ...subscribers.map((subscriber) => subscriber.email)])].join(", "))}
            className="inline-flex h-9 items-center justify-center rounded-xl border border-border px-3 text-xs font-black uppercase tracking-widest hover:bg-background"
          >
            Copy All Emails
          </button>
        </div>
        {subscribers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No newsletter subscribers yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {subscribers.map((subscriber) => (
              <span key={subscriber.email} className="rounded-full border border-border bg-background px-3 py-1 text-xs font-bold">
                {subscriber.email}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

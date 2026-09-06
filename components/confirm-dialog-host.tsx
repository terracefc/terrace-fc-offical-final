"use client"

import { useEffect, useState } from "react"
import { AlertTriangle } from "lucide-react"
import { CONFIRM_ACTION_EVENT, type ConfirmActionRequest } from "@/lib/confirm-action"

export function ConfirmDialogHost() {
  const [request, setRequest] = useState<ConfirmActionRequest | null>(null)

  useEffect(() => {
    const handleRequest = (event: Event) => {
      const nextRequest = (event as CustomEvent<ConfirmActionRequest>).detail
      if (nextRequest?.message) setRequest(nextRequest)
    }

    window.addEventListener(CONFIRM_ACTION_EVENT, handleRequest)
    return () => window.removeEventListener(CONFIRM_ACTION_EVENT, handleRequest)
  }, [])

  const close = (confirmed: boolean) => {
    request?.resolve(confirmed)
    setRequest(null)
  }

  if (!request) return null

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-background/75 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-background p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-black tracking-tight">Are you sure?</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{request.message}</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => close(false)}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-border text-xs font-black uppercase tracking-widest hover:bg-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => close(true)}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-foreground text-xs font-black uppercase tracking-widest text-background hover:bg-foreground/90"
          >
            Proceed
          </button>
        </div>
      </div>
    </div>
  )
}

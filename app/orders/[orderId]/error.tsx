"use client"

export default function OrderDetailsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <section className="w-full max-w-md rounded-2xl border border-border bg-background p-6 text-center shadow-sm">
        <h1 className="text-2xl font-black tracking-tight">Tracking temporarily unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">We couldn’t load this order’s live shipment details. Please try again.</p>
        <button type="button" onClick={() => reset()} className="mt-5 h-11 w-full rounded-xl bg-foreground text-sm font-black uppercase tracking-widest text-background">Try again</button>
      </section>
    </main>
  )
}

"use client"

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <section className="w-full max-w-lg rounded-2xl border border-border bg-background p-6 text-center shadow-sm">
        <h1 className="text-2xl font-black tracking-tight">Admin page temporarily unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">The order details could not be rendered. Try again and the rest of the admin panel will remain available.</p>
        <button type="button" onClick={() => reset()} className="mt-5 rounded-xl bg-foreground px-5 py-3 text-sm font-black uppercase tracking-widest text-background">Try again</button>
      </section>
    </main>
  )
}

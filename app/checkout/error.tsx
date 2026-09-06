"use client"

export default function CheckoutError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="min-h-screen bg-[#080506] px-4 py-24 text-white">
      <div className="mx-auto max-w-xl rounded-2xl border border-red-500/30 bg-white/[0.06] p-8 text-center">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-red-300">Checkout needs a refresh</p>
        <h1 className="mt-3 text-3xl font-black">Your cart is still safe.</h1>
        <p className="mt-3 text-sm leading-relaxed text-white/65">{error.digest ? "A temporary loading problem interrupted checkout. Try again to continue without losing your items." : "Checkout could not finish loading. Try again to continue without losing your items."}</p>
        <button type="button" onClick={reset} className="mt-6 rounded-xl bg-red-600 px-6 py-3 text-sm font-black uppercase tracking-wider text-white transition-colors hover:bg-red-500">Try checkout again</button>
      </div>
    </main>
  )
}

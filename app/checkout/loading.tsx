export default function CheckoutLoading() {
  return (
    <main className="min-h-screen bg-[#080506] px-4 py-24 text-white">
      <div className="mx-auto flex max-w-xl flex-col items-center rounded-2xl border border-white/10 bg-white/[0.06] p-10 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-red-500" />
        <p className="mt-5 text-sm font-black uppercase tracking-[0.2em]">Loading secure checkout</p>
        <p className="mt-2 text-sm text-white/60">Your cart is kept safe while the checkout loads.</p>
      </div>
    </main>
  )
}

"use client"

const confettiPieces = Array.from({ length: 42 }, (_, index) => ({
  id: index,
  left: `${(index * 37) % 100}%`,
  delay: `${(index % 9) * 38}ms`,
  color: ["#ef4444", "#ffffff", "#fbbf24", "#60a5fa"][index % 4],
  size: `${7 + (index % 4) * 2}px`,
}))

export function OrderSuccessCelebration({ visible }: { visible: boolean }) {
  if (!visible) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden" aria-live="polite" aria-label="Order confirmed">
      {confettiPieces.map((piece) => (
        <span
          key={piece.id}
          className="order-confetti-piece"
          style={{
            left: piece.left,
            width: piece.size,
            height: piece.size,
            backgroundColor: piece.color,
            animationDelay: piece.delay,
          }}
        />
      ))}
      <div className="absolute inset-x-4 top-8 mx-auto max-w-sm rounded-2xl border border-white/35 bg-black/85 p-5 text-center text-white shadow-2xl backdrop-blur-md">
        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-red-300">Payment successful</p>
        <p className="mt-2 text-xl font-black">Your order is confirmed.</p>
        <p className="mt-1 text-xs font-bold text-white/70">Opening your order details…</p>
      </div>
    </div>
  )
}

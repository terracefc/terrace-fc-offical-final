"use client"

import Image from "next/image"
import Link from "next/link"
import { Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react"
import { confirmAction } from "@/lib/confirm-action"
import { getCartItemUnitPrice, getJerseyBackLabel, getJerseyVersionLabel, isCustomBack, useStore } from "@/lib/store-context"
import { useSiteSettings } from "@/hooks/use-site-settings"
import { calculateDeliveryCharge } from "@/lib/checkout"
import { Button } from "./ui/button"
import { isEmbroideryOnlyKit } from "@/lib/pricing"
import { kits } from "@/lib/data"
import { getDisplayKitImages } from "@/lib/kit-images"
import { formatMoney } from "@/lib/currency"

export function CartDrawer() {
  const {
    cart,
    isCartOpen,
    closeCart,
    updateQuantity,
    removeFromCart,
    clearCart,
  } = useStore()
  const { testModeEnabled } = useSiteSettings()
  const subtotal = cart.reduce((sum, item) => sum + (testModeEnabled ? 1 : getCartItemUnitPrice(item)) * item.quantity, 0)
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0)
  const shipping = testModeEnabled ? 0 : calculateDeliveryCharge(subtotal, totalItems)
  const total = subtotal + shipping
  const hasCustomLeadTime = cart.some((item) => item.version !== "embroidery" && isCustomBack(item.customization))

  if (!isCartOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300" onClick={closeCart} />

      <div className="absolute inset-y-0 right-0 max-w-full flex pl-4 sm:pl-10">
        <div className="w-screen max-w-lg transform transition-transform duration-300 ease-out bg-[#080506] text-white border-l border-red-500/25 flex flex-col shadow-2xl relative">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(220,38,38,0.16),transparent_36%)]" />
          <div className="relative p-5 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-red-300" />
              <h2 className="text-xl font-black tracking-tight">Your Cart</h2>
              <span className="bg-red-500/20 text-red-200 text-xs font-bold px-2 py-0.5 rounded-full">
                {totalItems}
              </span>
            </div>
            <button onClick={closeCart} className="p-2 hover:bg-white/10 rounded-lg transition-colors" aria-label="Close cart">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="relative flex-1 overflow-y-auto p-5 space-y-6">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-white/60">
                  <ShoppingBag className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Your cart is empty</h3>
                  <p className="text-sm text-white/60 max-w-[240px] mx-auto mt-1">
                    Add some premium retro jerseys to start your collection.
                  </p>
                </div>
                <Button onClick={closeCart} className="mt-4 bg-red-600 text-white hover:bg-white hover:text-black">
                  Start Shopping
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-6">
                  {cart.map((item) => {
                    const kitImages = getDisplayKitImages(item.kit, kits)
                    const productImage = kitImages.image || "/placeholder-logo.png"

                    return (
                    <div key={item.lineId} className="flex gap-4 pb-6 border-b border-white/10 last:border-0">
                      <div className="h-20 w-20 rounded-lg overflow-hidden relative bg-black/50 flex-shrink-0 border border-white/15">
                        <Image src={productImage} alt={item.kit.name} fill className="object-cover" sizes="80px" quality={100} />
                      </div>

                      <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-start gap-2">
                            <h4 className="font-bold text-sm sm:text-base truncate">{item.kit.name}</h4>
                            <button
                              onClick={() => removeFromCart(item.lineId)}
                              className="text-white/45 hover:text-red-300 p-1 transition-colors"
                              aria-label={`Remove ${item.kit.name}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          <p className="text-xs text-white/60 truncate">{item.kit.club} - {item.kit.season}</p>
                          <p className="text-xs text-white/55 truncate">{item.kit.number} - {item.kit.color}</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            <span className="inline-block px-2 py-0.5 bg-white/10 text-[10px] font-bold rounded-md uppercase tracking-wider">
                              Size: {item.size}
                            </span>
                            {isEmbroideryOnlyKit(item.kit) || item.version === "embroidery" ? (
                              <>
                                <span className="inline-block px-2 py-0.5 bg-white/10 text-[10px] font-bold rounded-md uppercase tracking-wider">
                                  Embroidered Logo
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="inline-block px-2 py-0.5 bg-white/10 text-[10px] font-bold rounded-md uppercase tracking-wider">
                                  {getJerseyVersionLabel(item.version)}
                                </span>
                                <span className="inline-block px-2 py-0.5 bg-white/10 text-[10px] font-bold rounded-md uppercase tracking-wider">
                                  {getJerseyBackLabel(item.customization)}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex justify-between items-end">
                          <div className="flex items-center border border-white/15 rounded-lg overflow-hidden bg-black/35">
                            <button
                              onClick={() => updateQuantity(item.lineId, item.quantity - 1)}
                              className="p-1.5 hover:bg-white/10 transition-colors"
                              aria-label="Decrease quantity"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="px-3 py-0.5 text-sm font-semibold select-none">{item.quantity}</span>
                            <button
                              onClick={() => updateQuantity(item.lineId, item.quantity + 1)}
                              className="p-1.5 hover:bg-white/10 transition-colors"
                              aria-label="Increase quantity"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <span className="font-black text-sm text-red-300">
                            {formatMoney((testModeEnabled ? 1 : getCartItemUnitPrice(item)) * item.quantity)}
                          </span>
                        </div>
                      </div>
                    </div>
                    )
                  })}
                </div>

                <div className="space-y-5">
                  <div className="rounded-2xl border border-red-500/25 bg-black/45 p-4 space-y-3">
                    <div className="flex justify-between text-sm text-white/65">
                      <span>Subtotal</span>
                      <span>{formatMoney(subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-white/65">
                      <span>Shipping</span>
                      <span>{shipping === 0 ? "FREE" : formatMoney(shipping)}</span>
                    </div>
                    <div className="flex justify-between gap-3 text-sm text-white/65">
                      <span>Dispatch estimate</span>
                      <span className="text-right font-bold text-white">{hasCustomLeadTime ? "7-10 days" : "4-8 days"}</span>
                    </div>
                    <p className="text-right text-[10px] font-bold text-red-200">
                      Dispatch and delivery time depends on your location.
                    </p>
                    <div className="border-t border-white/10 my-2" />
                    <div className="flex justify-between items-baseline">
                      <span className="font-bold text-base">Total</span>
                      <span className="text-2xl font-black text-red-300">{formatMoney(total)}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <Button
                      asChild
                      className="w-full py-6 font-bold uppercase tracking-wider text-sm bg-red-600 text-white hover:bg-white hover:text-black transition-all duration-300"
                    >
                      <Link href="/checkout" onClick={closeCart}>
                        Continue
                      </Link>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={async () => {
                        if (!(await confirmAction("Are you sure you want to clear your entire cart?"))) return
                        clearCart()
                      }}
                      className="text-xs text-white/55 hover:text-red-300 transition-colors py-2"
                    >
                      Clear Entire Cart
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

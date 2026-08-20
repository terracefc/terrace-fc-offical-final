"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Check, ClipboardList, Copy, ShoppingBag, Search, Menu, X, Heart, UserRound } from "lucide-react"
import { useEffect, useState } from "react"
import { clearCustomer, readCustomer, type CustomerAccount } from "@/lib/customer-auth"
import { WELCOME_CODE } from "@/lib/coupons"
import { useStore } from "@/lib/store-context"

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [couponCopied, setCouponCopied] = useState(false)
  const [customer, setCustomer] = useState<CustomerAccount | null>(null)
  const pathname = usePathname()
  const { cart, favorites, openCart, openSearch } = useStore()

  useEffect(() => {
    const syncCustomer = () => setCustomer(readCustomer())
    syncCustomer()
    window.addEventListener("storage", syncCustomer)
    return () => window.removeEventListener("storage", syncCustomer)
  }, [])

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0)
  const favCount = favorites.length
  const isHome = pathname === "/"
  const showHomeButton = pathname !== "/"

  const copyWelcomeCode = async () => {
    await navigator.clipboard.writeText(WELCOME_CODE)
    setCouponCopied(true)
    window.setTimeout(() => setCouponCopied(false), 1600)
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      {!isHome && (
      <div className="overflow-hidden border-b border-background/10 bg-foreground py-1.5 text-background">
        <div className="mx-auto flex min-h-7 max-w-7xl items-center justify-center gap-2 px-3 text-center text-[10px] font-black uppercase tracking-wider sm:gap-4 sm:text-xs">
          <span className="hidden sm:inline">Flat ₹100 delivery across India</span>
          <span className="hidden h-1 w-1 rounded-full bg-background/60 sm:block" />
          <span>Use</span>
          <button
            type="button"
            onClick={copyWelcomeCode}
            className="inline-flex items-center gap-1.5 rounded-md border border-background/25 bg-background/10 px-2 py-0.5 text-sm font-black tracking-widest transition-colors hover:bg-background/20 sm:text-base"
            aria-label={`Copy ${WELCOME_CODE} coupon code`}
            title="Copy coupon code"
          >
            {WELCOME_CODE}
            {couponCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <span>to save ₹100</span>
        </div>
      </div>
      )}
      <div className={isHome ? "border-b border-white/10 bg-black/10 text-white backdrop-blur-[2px]" : "border-b border-red-950/60 bg-[#080506]/95 text-white backdrop-blur-xl"}>
        <div className={isHome ? "mx-auto px-4 sm:px-8 lg:px-12" : "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"}>
          <div className={isHome ? "grid h-20 grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-2 lg:grid-cols-[1fr_auto_1fr]" : "grid h-16 grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-2 lg:h-20"}>
            {/* Menu Button */}
            <button 
              className={isHome ? "-ml-2 flex h-10 w-10 items-center justify-center rounded-lg p-2 transition-colors hover:bg-white/10 lg:hidden" : "-ml-2 flex h-10 w-10 items-center justify-center rounded-lg p-2 transition-colors hover:bg-secondary"}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            {isHome && (
              <nav className="hidden items-center gap-7 text-sm font-semibold text-white/90 lg:flex">
                <Link href="/" className="hover:text-red-300">Home</Link>
                <Link href="/#shop-by-sport" className="hover:text-red-300">Categories</Link>
                <Link href="/support" className="hover:text-red-300">Contact Us</Link>
                <Link href="/request-jersey" className="hover:text-red-300">Request Jersey</Link>
                <button type="button" onClick={openSearch} className="hover:text-red-300">Search</button>
              </nav>
            )}

            {/* Logo */}
            <Link href="/" className={isHome ? "group min-w-0 justify-self-start lg:justify-self-center" : "group min-w-0 justify-self-start"}>
              <span className={isHome ? "block truncate text-2xl font-black tracking-tight text-white transition-colors group-hover:text-red-300 sm:text-3xl lg:text-4xl" : "block truncate text-2xl font-black tracking-tight transition-colors group-hover:text-accent sm:text-3xl lg:text-4xl"}>
                terrace<span className={isHome ? "text-red-400" : "text-accent"}>.</span>fc
              </span>
            </Link>

            {/* Right Nav */}
            <div className="flex min-w-0 items-center justify-end gap-0 sm:gap-1 lg:gap-2">
              {showHomeButton && (
                <Link
                  href="/"
                className="hidden h-10 items-center justify-center rounded-lg border border-white/15 px-2 text-[10px] font-black uppercase tracking-widest hover:bg-red-600 lg:inline-flex"
                >
                  Home
                </Link>
              )}

              {customer && (
                <Link
                  href="/profile"
                  aria-label="Track Order"
                  className="hidden h-10 items-center justify-center gap-1.5 rounded-lg border border-red-400/40 px-2 text-[10px] font-black uppercase tracking-widest text-red-200 hover:bg-red-600/20 sm:inline-flex"
                >
                  <ClipboardList className="h-4 w-4" />
                  Track Order
                </Link>
              )}

              {/* Search */}
              <button 
                onClick={openSearch}
                aria-label="Search" 
                className={isHome ? "h-10 w-10 rounded-lg transition-colors group flex flex-col items-center justify-center gap-0.5 hover:bg-white/10 lg:hidden" : "h-10 w-10 sm:h-auto sm:min-w-12 sm:w-auto sm:px-2 sm:py-1.5 hover:bg-secondary rounded-lg transition-colors group flex flex-col items-center justify-center gap-0.5"}
              >
                <Search className="w-5 h-5 group-hover:scale-110 transition-transform" />
                <span className="hidden sm:inline text-[9px] font-black uppercase tracking-widest leading-none">Search</span>
              </button>

              {/* Wishlist / Favorites */}
              <button 
                onClick={() => {
                  import("sonner").then(({ toast }) => {
                    if (favCount === 0) {
                      toast.info("Wishlist is empty", {
                        description: "Add some shirts to your wishlist by clicking the heart button on the jersey card!"
                      });
                    } else {
                      toast.success(`You have ${favCount} shirt(s) in your wishlist!`, {
                        description: "Click on any kit to view details or add to cart."
                      });
                    }
                  });
                }}
                aria-label="Wishlist" 
                className={isHome ? "h-10 w-10 rounded-lg transition-colors relative group flex flex-col items-center justify-center gap-0.5 hover:bg-white/10" : "h-10 w-10 sm:h-auto sm:min-w-12 sm:w-auto sm:px-2 sm:py-1.5 hover:bg-secondary rounded-lg transition-colors relative group flex flex-col items-center justify-center gap-0.5"}
              >
                <Heart className={`w-5 h-5 group-hover:scale-110 transition-transform ${favCount > 0 ? 'text-accent fill-accent' : ''}`} />
                <span className="hidden sm:inline text-[9px] font-black uppercase tracking-widest leading-none">Wish</span>
                {favCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-accent text-accent-foreground text-[8px] font-bold rounded-full flex items-center justify-center shadow-md animate-in zoom-in duration-200">
                    {favCount}
                  </span>
                )}
              </button>

              {/* Cart */}
              <button 
                onClick={openCart}
                aria-label="Cart" 
                className={isHome ? "h-10 w-10 rounded-lg transition-colors relative group flex flex-col items-center justify-center gap-0.5 hover:bg-white/10" : "h-10 w-10 sm:h-auto sm:min-w-12 sm:w-auto sm:px-2 sm:py-1.5 hover:bg-secondary rounded-lg transition-colors relative group flex flex-col items-center justify-center gap-0.5"}
              >
                <ShoppingBag className="w-5 h-5 group-hover:scale-110 transition-transform" />
                <span className="hidden sm:inline text-[9px] font-black uppercase tracking-widest leading-none">Cart</span>
                {cartItemCount > 0 && (
                  <span className="absolute top-1 right-1 w-5 h-5 bg-accent text-accent-foreground text-[10px] font-bold rounded-full flex items-center justify-center shadow-lg animate-in zoom-in duration-200">
                    {cartItemCount}
                  </span>
                )}
              </button>

              <Link
                href="/profile"
                aria-label="Profile"
                className={isHome ? "h-10 w-10 rounded-lg transition-colors group flex flex-col items-center justify-center gap-0.5 hover:bg-white/10" : "h-10 w-10 sm:h-auto sm:min-w-12 sm:w-auto sm:px-2 sm:py-1.5 hover:bg-secondary rounded-lg transition-colors group flex flex-col items-center justify-center gap-0.5"}
              >
                <UserRound className="w-5 h-5 group-hover:scale-110 transition-transform" />
                <span className="hidden sm:inline text-[9px] font-black uppercase tracking-widest leading-none">Profile</span>
              </Link>

              {customer && (
                <button
                  type="button"
                  onClick={async () => {
                    await fetch("/api/auth/google/logout", { method: "POST", credentials: "same-origin", cache: "no-store" }).catch(() => null)
                    clearCustomer()
                    setCustomer(null)
                    window.location.replace("/")
                  }}
                  className="hidden h-10 items-center justify-center rounded-lg border border-white/15 px-2 text-[10px] font-black uppercase tracking-widest hover:bg-red-600 sm:inline-flex"
                >
                  Logout
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className={isHome ? "border-b border-white/10 bg-black/85 text-white shadow-xl backdrop-blur-xl" : "bg-background border-b border-border shadow-xl"}>
          <nav className="mx-auto flex max-w-7xl flex-col px-4 py-6 gap-2 sm:px-6 lg:px-8">
            {showHomeButton && (
              <Link
                href="/"
                className="text-sm font-bold tracking-widest uppercase py-3 px-4 hover:bg-secondary rounded-lg transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Home
              </Link>
            )}
            <Link 
              href="/#shop-by-sport" 
              className="text-sm font-bold tracking-widest uppercase py-3 px-4 hover:bg-secondary rounded-lg transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              Categories
            </Link>
            <Link 
              href="/leagues" 
              className="text-sm font-bold tracking-widest uppercase py-3 px-4 hover:bg-secondary rounded-lg transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              Leagues
            </Link>
            <Link
              href="/request-jersey"
              className="text-sm font-bold tracking-widest uppercase py-3 px-4 hover:bg-secondary rounded-lg transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              Request Jersey
            </Link>
            <Link 
              href="/#about" 
              className="text-sm font-bold tracking-widest uppercase py-3 px-4 hover:bg-secondary rounded-lg transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              About
            </Link>
            <Link
              href="/support"
              className="text-sm font-bold tracking-widest uppercase py-3 px-4 hover:bg-secondary rounded-lg transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              Help
            </Link>
            {customer && (
              <>
              <Link
                href="/profile"
                className="text-sm font-bold tracking-widest uppercase py-3 px-4 hover:bg-secondary rounded-lg transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Profile
              </Link>
              <Link
                href="/profile"
                className="text-sm font-bold tracking-widest uppercase py-3 px-4 hover:bg-secondary rounded-lg transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Track Order
              </Link>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  )
}

"use client"

import { useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import Image from "next/image"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { CartDrawer } from "@/components/cart-drawer"
import { SearchModal } from "@/components/search-modal"
import { ProductScrollReveal } from "@/components/product-scroll-reveal"
import { useSiteSettings } from "@/hooks/use-site-settings"
import { kits } from "@/lib/data"
import { fetchPublicInventory, readCachedPublicInventory, type EditableKit } from "@/lib/inventory-client"
import { getDisplayKitImages } from "@/lib/kit-images"
import { sortKitsForStorefront } from "@/lib/kit-sorting"
import { findLeagueBySlug, getDisplayLeague } from "@/lib/leagues"
import { getKitDisplayBadge, getKitOriginalPrice, getKitSalePrice } from "@/lib/pricing"

export default function LeagueDetailPage() {
  const params = useParams()
  const slug = String(params.slug || "")
  const [publishedKits, setPublishedKits] = useState<EditableKit[]>(() => readCachedPublicInventory(kits))
  const { testModeEnabled } = useSiteSettings()

  useEffect(() => {
    fetchPublicInventory(kits).then(setPublishedKits).catch(() => null)
  }, [])

  const league = useMemo(() => findLeagueBySlug(publishedKits, slug), [publishedKits, slug])
  const leagueKits = useMemo(() => {
    if (!league) return []
    return sortKitsForStorefront(publishedKits.filter((kit) => getDisplayLeague(kit.league) === league.name))
  }, [publishedKits, league])

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Header />
      <div className="pt-28">
        <section className="px-4 py-10 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <Link href="/leagues" className="mb-8 inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-accent">
              <ArrowLeft className="h-4 w-4" />
              All Leagues
            </Link>

            {league ? (
              <div>
                <div className={`mb-5 h-2 w-28 rounded-full bg-gradient-to-r ${league.color}`} />
                <p className="text-xs font-black uppercase tracking-widest text-accent">League Collection</p>
                <h1 className="mt-2 text-5xl font-black tracking-tighter sm:text-6xl lg:text-7xl">{league.name}</h1>
                <p className="mt-3 text-muted-foreground">{league.count} published jerseys available.</p>
              </div>
            ) : (
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-accent">League Collection</p>
                <h1 className="mt-2 text-5xl font-black tracking-tighter">League not found</h1>
                <p className="mt-3 text-muted-foreground">This league page does not have any published jerseys right now.</p>
              </div>
            )}
          </div>
        </section>

        <section className="px-4 pb-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            {leagueKits.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-8 text-sm text-muted-foreground">
                No jerseys found for this league.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {leagueKits.map((kit, index) => {
                  const displayBadge = getKitDisplayBadge(kit)
                  const salePrice = getKitSalePrice(kit, testModeEnabled)
                  const originalPrice = getKitOriginalPrice(kit, testModeEnabled)
                  const kitImages = getDisplayKitImages(kit, publishedKits)

                  return (
                  <LazyProductCard key={kit.id} index={index} eager={index < 8}>
                  <Link
                    href={`/kit/${kit.id}`}
                    className="group block"
                  >
                    <div className="relative mb-3 aspect-square overflow-hidden rounded-2xl border border-border bg-secondary shadow-sm">
                      <ProductImage src={kitImages.image} alt={kit.name} />
                      {displayBadge && (
                        <span className="absolute left-3 top-3 rounded-full bg-foreground px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-background">
                          {displayBadge}
                        </span>
                      )}
                    </div>
                    <h2 className="truncate text-sm font-black group-hover:text-accent">{kit.name}</h2>
                    <p className="truncate text-xs text-muted-foreground">{kit.club} - {kit.season}</p>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <p className="font-black text-accent">₹{salePrice.toLocaleString("en-IN")}</p>
                        {originalPrice && (
                          <p className="text-xs font-bold text-muted-foreground line-through">₹{originalPrice.toLocaleString("en-IN")}</p>
                        )}
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100" />
                    </div>
                  </Link>
                  </LazyProductCard>
                  )
                })}
              </div>
            )}
          </div>
        </section>
      </div>
      <Footer />
      <CartDrawer />
      <SearchModal />
    </main>
  )
}

function LazyProductCard({ children, index }: { children: ReactNode; index: number; eager?: boolean }) {
  return (
    <div className="min-h-[280px]">
      <ProductScrollReveal index={index}>
        {children}
      </ProductScrollReveal>
    </div>
  )
}

function ProductImage({ src, alt }: { src: string; alt: string }) {
  if (src.startsWith("data:")) {
    return <img src={src} alt={alt} loading="lazy" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
  }

  return <Image src={src} alt={alt} fill loading="lazy" className="object-cover transition-transform duration-700 group-hover:scale-105" sizes="240px" />
}

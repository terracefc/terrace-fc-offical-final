"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { CartDrawer } from "@/components/cart-drawer"
import { SearchModal } from "@/components/search-modal"
import { kits } from "@/lib/data"
import { getLeagueCards, getLeagueSlug } from "@/lib/leagues"
import { fetchPublicInventory, readCachedPublicInventory, type EditableKit } from "@/lib/inventory-client"

export default function LeaguesPage() {
  const [publishedKits, setPublishedKits] = useState<EditableKit[]>(() => readCachedPublicInventory(kits))

  useEffect(() => {
    fetchPublicInventory(kits).then(setPublishedKits).catch(() => null)
  }, [])

  const leagues = useMemo(() => getLeagueCards(publishedKits), [publishedKits])

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Header />
      <div className="pt-28">
        <section className="px-4 sm:px-6 lg:px-8 py-14">
          <div className="mx-auto max-w-7xl">
            <p className="text-xs font-black uppercase tracking-widest text-accent">Browse By League</p>
            <h1 className="mt-2 text-5xl sm:text-6xl lg:text-7xl font-black tracking-tighter">League Collection</h1>
            <p className="mt-4 max-w-2xl text-muted-foreground text-lg">
              Choose a league to open its own jersey page.
            </p>
          </div>
        </section>

        <section className="px-4 sm:px-6 lg:px-8 pb-20">
          <div className="mx-auto grid max-w-7xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {leagues.map((league, index) => (
              <Link
                key={league.name}
                href={`/leagues/${getLeagueSlug(league.name)}`}
                className="group relative min-h-48 overflow-hidden rounded-2xl border border-border bg-secondary text-background shadow-sm"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${league.color} opacity-90 transition-opacity group-hover:opacity-100`} />
                <div className="absolute inset-0 bg-black/10" />
                <div className="relative z-10 flex h-full min-h-48 flex-col justify-between p-5">
                  <span className="text-xs font-mono text-white/70">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h2 className="text-3xl font-black tracking-tight text-white">{league.name}</h2>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span className="text-sm font-bold text-white/75">{league.count} kits available</span>
                      <ArrowRight className="h-5 w-5 text-white transition-transform group-hover:translate-x-1" />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
      <Footer />
      <CartDrawer />
      <SearchModal />
    </main>
  )
}

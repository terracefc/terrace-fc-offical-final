"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { kits } from "@/lib/data"
import { fetchPublicInventory, readCachedPublicInventory, type EditableKit } from "@/lib/inventory-client"
import { getLeagueCards, getLeagueSlug } from "@/lib/leagues"

export function ClubsSection() {
  const [publishedKits, setPublishedKits] = useState<EditableKit[]>(() => readCachedPublicInventory(kits))

  useEffect(() => {
    fetchPublicInventory(kits).then(setPublishedKits).catch(() => null)
  }, [])

  const leagues = getLeagueCards(publishedKits).slice(0, 4)

  return (
    <section id="clubs" className="py-24 lg:py-32 bg-foreground text-background relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
          backgroundSize: "24px 24px",
        }}
      />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-accent/10 blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between mb-16">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-background/10 rounded-full text-xs font-bold tracking-widest uppercase text-background/80 mb-6">
              Browse By League
            </div>
            <h2 className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tighter">
              Leagues<br />
              <span className="font-serif italic text-accent">Directory</span>
            </h2>
          </div>
          <Link
            href="/leagues"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border-2 border-background/30 px-5 text-xs font-black uppercase tracking-widest hover:bg-background hover:text-foreground"
          >
            View All Leagues
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {leagues.map((league, index) => (
            <Link
              key={league.name}
              href={`/leagues/${getLeagueSlug(league.name)}`}
              className="group relative overflow-hidden rounded-2xl aspect-[4/3] hover-lift text-left w-full cursor-pointer"
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${league.color} opacity-85 group-hover:opacity-100 transition-opacity`} />
              <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-colors" />
              <div className="absolute inset-0 p-5 flex flex-col justify-between">
                <span className="text-xs font-mono text-white/60">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h3 className="font-bold text-lg text-white mb-1 group-hover:translate-x-1 transition-transform">{league.name}</h3>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white/70">{league.count} kits available</span>
                    <ArrowRight className="w-4 h-4 text-white opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}

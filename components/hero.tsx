"use client"

import Image from "next/image"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { toast } from "sonner"

const sportLinks = [
  { label: "Football", href: "/collection?sport=football", state: "Jerseys" },
  { label: "Cricket", href: "", state: "Coming soon" },
  { label: "F1", href: "/collection?category=f1", state: "Teamwear" },
]

export function Hero() {
  const scrollToShopBySport = () => {
    const target = document.getElementById("shop-by-sport")
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" })
      return
    }
    window.location.href = "/#shop-by-sport"
  }

  return (
    <section className="relative min-h-[78svh] overflow-hidden bg-[#090405] text-background sm:min-h-[100svh]">
      <Image
        src="/kits/2026-27/real-madrid-away-2026-27-campaign.png"
        alt=""
        fill
        aria-hidden="true"
        quality={100}
        sizes="100vw"
        className="z-0 scale-110 object-cover object-center blur-2xl sm:hidden"
      />
      <Image
        src="/kits/2026-27/real-madrid-away-2026-27-campaign.png"
        alt="Real Madrid 2026-27 kit collection"
        fill
        priority
        quality={100}
        sizes="100vw"
        data-load-gate="true"
        className="z-10 scale-[1.03] object-cover object-[center_30%] sm:hidden"
      />
      <Image
        src="/kits/2026-27/real-madrid-away-2026-27-desktop-hero.png"
        alt="Real Madrid 2026-27 kit collection"
        fill
        priority
        quality={100}
        sizes="100vw"
        data-load-gate="true"
        className="z-0 hidden object-cover object-center sm:block"
      />
      <div className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-b from-black/10 via-transparent to-black/76 sm:from-black/62 sm:via-red-950/16 sm:to-black/86" />
      <div className="pointer-events-none absolute inset-0 z-20 hidden bg-[radial-gradient(circle_at_20%_12%,rgba(220,38,38,0.34),transparent_28%),radial-gradient(circle_at_82%_70%,rgba(127,29,29,0.25),transparent_30%)] sm:block" />

      <div className="relative z-30 flex min-h-[78svh] items-end px-4 pb-6 pt-24 sm:min-h-[100svh] sm:px-8 sm:pb-12 lg:px-12">
        <div className="w-full">
          <div className="max-w-5xl">
            <p className="mb-2 max-w-[92vw] text-[8px] font-black uppercase tracking-[0.18em] text-white/85 sm:mb-3 sm:text-sm sm:tracking-[0.45em]">
              New season . Club jerseys
            </p>
            <h1 className="text-outline-white max-w-[980px] text-[1.6rem] font-black uppercase leading-[0.9] tracking-[0.01em] drop-shadow-2xl sm:text-5xl md:text-6xl lg:text-[5rem] xl:text-[5.8rem]">
              <span className="block sm:inline">Real Madrid</span>
              <span className="block sm:inline"> 2026–27</span>
            </h1>
            <p className="mt-2 max-w-3xl text-[7px] font-black uppercase leading-relaxed tracking-[0.1em] text-white/88 sm:mt-4 sm:text-sm sm:tracking-[0.28em]">
              Home, away and third kits, made for match days and collectors.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2 sm:mt-7 sm:gap-3">
              <button
                type="button"
                onClick={scrollToShopBySport}
                className="inline-flex h-9 items-center gap-2 border border-red-500 bg-black/45 px-3 text-[8px] font-black uppercase tracking-widest text-red-200 backdrop-blur-sm transition-colors hover:bg-red-600 hover:text-white sm:h-11 sm:gap-3 sm:px-4 sm:text-xs"
              >
                Shop Now
                <ArrowRight className="h-4 w-4" />
              </button>
              <Link
                href="/request-jersey"
                className="inline-flex h-9 items-center border border-white/35 bg-white/10 px-3 text-[8px] font-black uppercase tracking-widest text-white backdrop-blur-sm transition-colors hover:bg-white hover:text-black sm:h-11 sm:px-4 sm:text-xs"
              >
                Request a Jersey
              </Link>
            </div>
          </div>

          <div className="mt-6 grid max-w-3xl grid-cols-3 border border-white/25 bg-black/20 text-white backdrop-blur-sm sm:mt-8">
            {sportLinks.map((sport) => sport.href ? (
              <Link key={sport.label} href={sport.href} className="group min-h-16 border-r border-white/20 p-2 last:border-r-0 hover:bg-red-600 hover:text-white sm:min-h-20 sm:p-4">
                <p className="text-[10px] font-black uppercase tracking-widest sm:text-base">{sport.label}</p>
                <p className="mt-1 text-[7px] font-bold uppercase tracking-widest text-current/70 sm:mt-2 sm:text-[10px]">{sport.state}</p>
              </Link>
            ) : (
              <button
                key={sport.label}
                type="button"
                onClick={() => toast.error(`${sport.label} jerseys are coming soon`, { description: "You can request one now and we will help you source it." })}
                className="group min-h-16 border-r border-white/20 p-2 text-left last:border-r-0 hover:bg-red-600 hover:text-white sm:min-h-20 sm:p-4"
              >
                <p className="text-[10px] font-black uppercase tracking-widest sm:text-base">{sport.label}</p>
                <p className="mt-1 text-[7px] font-bold uppercase tracking-widest text-current/70 sm:mt-2 sm:text-[10px]">{sport.state}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

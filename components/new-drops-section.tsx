"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useState } from "react"
import { ArrowRight } from "lucide-react"
import { kits } from "@/lib/data"

export function NewDropsSection() {
  const realMadridDrop = kits.find((kit) => kit.id === 360) || kits.find((kit) => kit.id === 326) || kits.find((kit) => /real madrid/i.test(kit.club))
  const manchesterUnitedAwayDrop = kits.find((kit) => kit.id === 340) || kits.find((kit) => /manchester united/i.test(kit.club) && /away/i.test(kit.season))
  const barcelonaDrop = kits.find((kit) => kit.id === 343) || kits.find((kit) => /barcelona/i.test(kit.club))
  const [activeSlide, setActiveSlide] = useState(0)

  const slides = [
    {
      title: "Real Madrid 2026–27",
      description: "Home, away and third kits from the new Real Madrid collection.",
      image: "/kits/2026-27/real-madrid-away-2026-27-desktop-hero.png",
      mobileImage: "/kits/2026-27/real-madrid-away-2026-27-campaign.png",
      href: `/kit/${realMadridDrop?.id ?? 360}`,
      cta: "Shop Real Madrid",
      objectPosition: "center top",
    },
    {
      title: "Manchester United",
      description: "The new blue away kit for 2026–27, made for match days and collectors.",
      image: "/new-drops-manchester-united-away.png",
      href: `/kit/${manchesterUnitedAwayDrop?.id ?? 340}`,
      cta: "Shop Man United Away",
      objectPosition: "center",
    },
    {
      title: "Barcelona",
      description: "The new Blaugrana home look, made for match days and collectors.",
      image: "/new-drops-club-jerseys-barcelona.png",
      href: `/kit/${barcelonaDrop?.id ?? 343}`,
      cta: "Shop Barcelona",
      objectPosition: "center",
    },
  ]

  useEffect(() => {
    if (slides.length < 2) return
    const timer = window.setInterval(() => setActiveSlide((current) => (current + 1) % slides.length), 2000)
    return () => window.clearInterval(timer)
  }, [slides.length])

  if (!realMadridDrop || !manchesterUnitedAwayDrop || !barcelonaDrop) return null
  const slide = slides[activeSlide]

  return (
    <section className="homepage-reveal bg-[#080506] py-10 text-white sm:py-16">
      <div className="px-4 sm:px-8 lg:px-12">
        <p className="text-xs font-black uppercase tracking-[0.36em] text-red-300">New Drops</p>
        <h2 className="mt-1 text-4xl font-black uppercase leading-none text-white sm:text-6xl lg:text-7xl">
          {slide.title}
        </h2>
      </div>
      <div className="relative mt-5 overflow-hidden border-y border-white/10 bg-black">
        <div className="relative aspect-[5/4] sm:aspect-[16/10] lg:aspect-video">
          <Image
            src={slide.mobileImage || slide.image}
            alt=""
            fill
            aria-hidden="true"
            sizes="100vw"
            className="scale-110 object-cover blur-2xl sm:hidden"
            style={{ objectPosition: slide.objectPosition }}
          />
          <div key={slide.image} className="absolute inset-0 new-drop-slide-in">
            <Image
              src={slide.mobileImage || slide.image}
              alt={`${slide.title} new drop`}
              fill
              sizes="100vw"
              quality={100}
              className="object-contain sm:hidden"
              style={{ objectPosition: slide.objectPosition }}
            />
            <Image
              src={slide.image}
              alt=""
              fill
              aria-hidden="true"
              sizes="100vw"
              quality={100}
              className="hidden object-cover sm:block"
              style={{ objectPosition: slide.objectPosition }}
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-r from-black/92 via-black/46 to-black/10" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/78 via-transparent to-black/8" />

          <div className="relative z-10 flex h-full max-w-7xl flex-col justify-end px-5 pb-8 sm:px-8 sm:pb-12 lg:px-12">
            <p className="mt-3 max-w-xl text-sm font-bold leading-relaxed text-white/82 sm:text-base">
              {slide.description}
            </p>
            <Link
              href={slide.href}
              className="mt-6 inline-flex h-11 w-fit items-center gap-2 border border-red-400 bg-red-600 px-4 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-black sm:h-12 sm:px-5 sm:text-xs"
            >
              {slide.cta}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
      <div className="flex justify-center gap-2 pt-5" aria-label="New drops slides">
        {slides.map((item, index) => (
          <button
            key={item.title}
            type="button"
            aria-label={`Show ${item.title}`}
            aria-pressed={activeSlide === index}
            onClick={() => setActiveSlide(index)}
            className={`h-1.5 rounded-full transition-all ${activeSlide === index ? "w-10 bg-red-400" : "w-5 bg-white/25 hover:bg-white/55"}`}
          />
        ))}
      </div>
    </section>
  )
}

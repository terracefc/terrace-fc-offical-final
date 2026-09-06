"use client"

import Image from "next/image"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { toast } from "sonner"

const categories = [
  {
    title: "Club Jerseys",
    subtitle: "New season club colours.",
    image: "/category-club-jerseys.png",
    href: "/collection?category=club",
    position: "center",
    zoom: "scale-100",
  },
  {
    title: "Retro",
    subtitle: "Classic club shirts.",
    image: "/category-retro.png",
    href: "/collection?category=retro",
    position: "center",
    zoom: "scale-100",
  },
  {
    title: "World Cup",
    subtitle: "International drops.",
    image: "/category-world-cup.png",
    href: "/collection?category=world-cup",
    position: "center",
    zoom: "scale-105",
  },
  {
    title: "Jackets",
    subtitle: "Layer up in terrace style.",
    image: "/category-jackets.png",
    href: "/collection?category=jackets",
    position: "center",
    zoom: "scale-100",
  },
  {
    title: "Cricket",
    subtitle: "Coming soon.",
    image: "/category-cricket.png",
    href: "/collection?category=cricket",
    position: "center top",
    zoom: "scale-100",
  },
  {
    title: "F1",
    subtitle: "Teamwear drops.",
    image: "/category-f1.png",
    href: "/collection?category=f1",
    position: "center",
    zoom: "scale-100",
  },
]

export function FeaturedCategories() {
  return (
    <section id="shop-by-sport" className="homepage-reveal scroll-mt-24 bg-black py-10 text-white sm:py-20">
      <div className="px-4 sm:px-8 lg:px-12">
        <div className="mb-8">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-red-300 sm:text-xs sm:tracking-[0.35em]">Featured Categories</p>
            <h2 className="mt-2 text-4xl font-black uppercase tracking-normal text-outline-white sm:text-7xl lg:text-8xl">
              Shop By Sport
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {categories.map((category, index) => (
            <Link
              key={category.title}
              href={category.href}
              onClick={(event) => {
                if (category.title === "Cricket") {
                  event.preventDefault()
                  toast.error(`${category.title} jerseys are coming soon`, { description: "You can request a new drop from the support button." })
                }
              }}
              className="group relative aspect-[3/4] overflow-hidden border border-background/10 bg-background/5 sm:aspect-[4/5]"
            >
              <CategoryTile category={category} index={index} />
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}

function CategoryTile({ category, index }: { category: typeof categories[number]; index: number }) {
  return (
    <>
      <Image
        src={category.image}
        alt={`${category.title} category`}
        fill
        sizes="(max-width: 768px) 100vw, 25vw"
        quality={100}
        className={`object-cover transition-transform duration-700 ${category.zoom} group-hover:scale-[1.15]`}
        style={{ objectPosition: category.position }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-red-950/15 to-black/86" />
      <div className="absolute right-0 top-0 p-4">
        <span className="text-xs font-black text-white/70">{String(index + 1).padStart(2, "0")}</span>
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-5">
        <h3 className="text-lg font-black uppercase tracking-normal text-outline-white sm:text-5xl">{category.title}</h3>
        <p className="mt-1 max-w-xs text-[9px] font-bold leading-relaxed text-white/78 sm:mt-2 sm:text-sm">{category.subtitle}</p>
        <span className="mt-2 inline-flex h-7 items-center gap-1.5 border border-red-400 px-2.5 text-[8px] font-black uppercase tracking-widest text-red-100 transition-colors group-hover:bg-red-600 group-hover:text-white sm:mt-4 sm:h-10 sm:px-3 sm:text-[10px]">
          Open
          <ArrowRight className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
        </span>
      </div>
    </>
  )
}

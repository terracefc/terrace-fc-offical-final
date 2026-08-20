"use client"

import { useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import { ArrowRight, ShoppingBag, Heart, Check } from "lucide-react"
import { ProductScrollReveal } from "@/components/product-scroll-reveal"
import { Button } from "@/components/ui/button"
import { useSiteSettings } from "@/hooks/use-site-settings"
import { kits } from "@/lib/data"
import { defaultHomepageContent, type HomepageContent } from "@/lib/homepage-content"
import { fetchPublicInventory, getKitSizeStock, getKitStock, getSelectableKitSizes, getSizeDisplayLabel, isKidsKit, readCachedPublicInventory, type EditableKit } from "@/lib/inventory-client"
import { getDisplayKitImages } from "@/lib/kit-images"
import { sortKitsForStorefront } from "@/lib/kit-sorting"
import { getKitDisplayBadge, getKitOriginalPrice, getKitSalePrice, isEmbroideryOnlyKit, isWorldCup2026Kit } from "@/lib/pricing"
import { JERSEY_VERSION_PRICES, useStore } from "@/lib/store-context"
import Image from "next/image"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { toast } from "sonner"

export function FeaturedKits({ mode = "collection" }: { mode?: "home" | "collection" }) {
  const [hoveredKit, setHoveredKit] = useState<number | null>(null)
  const [sizeSelectorOpen, setSizeSelectorOpen] = useState<number | null>(null)
  const [publishedKits, setPublishedKits] = useState<EditableKit[]>(() => readCachedPublicInventory(kits))
  const [homepageContent, setHomepageContent] = useState<HomepageContent>(defaultHomepageContent)
  const [collectionFilter, setCollectionFilter] = useState({ category: "", club: "", sport: "" })
  const { addToCart, toggleFavorite, isFavorite, openCart } = useStore()
  const { testModeEnabled } = useSiteSettings()
  const searchParams = useSearchParams()
  const browseableKits = publishedKits.filter((kit) => !isEmbroideryOnlyKit(kit))

  useEffect(() => {
    const syncInventory = () => {
      fetchPublicInventory(kits).then(setPublishedKits).catch(() => null)
    }

    syncInventory()
    window.addEventListener("storage", syncInventory)
    window.addEventListener("focus", syncInventory)

    return () => {
      window.removeEventListener("storage", syncInventory)
      window.removeEventListener("focus", syncInventory)
    }
  }, [])

  useEffect(() => {
    if (mode !== "home") return

    fetch("/api/admin/homepage")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (data.content) setHomepageContent(data.content)
      })
      .catch(() => null)
  }, [mode])

  useEffect(() => {
    if (mode !== "collection") return
    setCollectionFilter({
      category: searchParams.get("category") || "",
      club: searchParams.get("club") || "",
      sport: searchParams.get("sport") || "",
    })
  }, [mode, searchParams])

  const visibleKits = useMemo(() => {
    if (mode === "home") {
        return homepageContent.featuredKitIds
        .map((id) => browseableKits.find((kit) => kit.id === id))
        .filter(Boolean) as EditableKit[]
    }

    const filteredKits = browseableKits.filter((kit) => {
      const category = collectionFilter.category.toLowerCase()
      const club = collectionFilter.club.toLowerCase()
      const sport = collectionFilter.sport.toLowerCase()
      const season = String(kit.season || "").toLowerCase()
      const league = String(kit.league || "").toLowerCase()
      const kitClub = String(kit.club || "").toLowerCase()

      const isFootballJersey = (kit.productType || "jersey") === "jersey" || kit.productType === "embroidery"
      const isInternational = league.includes("international")

      if (club) return kitClub === club && isFootballJersey
      if (category === "f1") return kit.productType === "f1"
      if (category === "kids") return kit.productType === "kids"
      if (category === "jackets") return kit.productType === "jacket"
      if (category === "cricket") return false
      if (category === "world-cup") return isFootballJersey && isWorldCup2026Kit(kit)
      if (category === "retro") return isTrueRetroKit(kit)
      if (category === "club") return isFootballJersey && !isInternational && !isTrueRetroKit(kit)
      if (sport === "football") return isFootballJersey
      return isCurrentYearJersey(kit)
    })

    return filteredKits.length > 0 ? sortKitsForStorefront(filteredKits) : []
  }, [browseableKits, collectionFilter, homepageContent.featuredKitIds, mode])

  const displayKits = visibleKits.slice(0, mode === "home" ? 8 : visibleKits.length)
  const priceRangeLabel = "₹999 - ₹1,499"
  const collectionHeading = getCollectionHeading(collectionFilter)
  const isF1Collection = collectionFilter.category.toLowerCase() === "f1"
  return (
    <section id="shop" className={mode === "collection" ? "relative bg-[#080506] py-16 text-white sm:py-20 lg:py-24" : "py-24 lg:py-32 relative noise-texture"}>
      {/* Background accent */}
      <div className={mode === "collection" ? `absolute inset-0 ${isF1Collection ? "bg-[radial-gradient(circle_at_top_right,rgba(220,38,38,0.08),transparent_32%),linear-gradient(180deg,rgba(15,15,18,0.72),transparent_42%)]" : "bg-[radial-gradient(circle_at_top_right,rgba(220,38,38,0.12),transparent_34%),linear-gradient(180deg,rgba(127,29,29,0.12),transparent_38%)]"} pointer-events-none` : "absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-accent/5 to-transparent pointer-events-none"} />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <div className="mb-16 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className={mode === "collection" ? "w-full min-w-0 flex-1" : ""}>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-accent/10 rounded-full text-xs font-bold tracking-widest uppercase text-accent mb-4">
              <span className="w-1.5 h-1.5 bg-accent rounded-full" />
              {mode === "home" ? "Homepage Picks" : collectionHeading.badge}
            </div>
            <h2 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-normal uppercase text-outline-white">
              {mode === "home" ? "Featured" : collectionHeading.title}<br />
              <span>{mode === "home" ? "Kits" : collectionHeading.accent}</span>
            </h2>
            {mode === "collection" && (
              <p className="mt-3 max-w-xl text-sm font-bold text-white/60">{collectionHeading.description}</p>
            )}
            {mode === "collection" && <CollectionCategoryRail />}
          </div>
          <Button 
            variant="outline" 
            asChild={mode === "home"}
            onClick={mode === "home" ? undefined : openCart}
            className={mode === "collection" ? "hidden border-2 border-white/25 bg-white/5 px-6 py-5 text-white transition-all hover:bg-white hover:text-black lg:inline-flex" : "group border-2 px-6 py-5 hover:bg-foreground hover:text-background transition-all"}
          >
            {mode === "home" ? (
              <Link href="/collection">
                View All Jerseys
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </Link>
            ) : (
              <>
                View Your Cart
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </Button>
        </div>

        {/* Kits Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
          {displayKits.map((kit, index) => {
            const isMysteryKit = kit.id === 66
            const isF1Product = kit.productType === "f1" || kit.league === "Formula 1"
            const isKidsProduct = isKidsKit(kit)
            const isJacketProduct = kit.productType === "jacket"
            const isSingleVersionProduct = isF1Product || isKidsProduct || isJacketProduct
            const salePrice = getKitSalePrice(kit, testModeEnabled)
            const cardPrice = isMysteryKit ? salePrice : isSingleVersionProduct ? (testModeEnabled ? 1 : kit.price) : testModeEnabled ? 1 : JERSEY_VERSION_PRICES.fan
            const pricedKit = { ...kit, price: cardPrice }
            const displayBadge = getKitDisplayBadge(kit)
            const originalPrice = isMysteryKit ? getKitOriginalPrice(kit, testModeEnabled) : isSingleVersionProduct || testModeEnabled ? null : JERSEY_VERSION_PRICES.fan + 100
            const isEmbroideryOnly = isEmbroideryOnlyKit(kit)
            const fav = isFavorite(kit.id);
            const isSizeOpen = sizeSelectorOpen === kit.id;
            const stock = getKitStock(kit);
            const isOutOfStock = stock <= 0;
            const shouldShowStock = isOutOfStock || stock <= 5;
            const kitImages = getDisplayKitImages(kit, publishedKits)

            return (
              <LazyProductCard key={kit.id} index={index} eager={index < (mode === "home" ? 4 : 8)}>
              <Link 
                href={`/kit/${kit.id}`}
                className="group block cursor-pointer select-none"
                onMouseEnter={() => setHoveredKit(kit.id)}
                onMouseLeave={() => {
                  setHoveredKit(null)
                  setSizeSelectorOpen(null)
                }}
              >
                {/* Image Container */}
                <div className={`aspect-square rounded-2xl overflow-hidden relative mb-4 transition-all duration-500 ${hoveredKit === kit.id ? 'shadow-xl scale-[1.02]' : 'shadow-sm border border-border/40'}`}>
                  {/* Cropped Kit Image */}
                  <ProductImage src={kitImages.image} backSrc={kitImages.backImage} alt={kit.name} priority={index < (mode === "home" ? 4 : 8)} />
                  
                  {/* Badge */}
                  {displayBadge && (
                    <div className="absolute top-3 left-3 bg-foreground text-background px-2.5 py-1 rounded-full text-[9px] sm:text-[10px] font-black tracking-wider uppercase shadow-md animate-in fade-in duration-300">
                      {displayBadge}
                    </div>
                  )}

                  {isOutOfStock && (
                    <div className="absolute top-3 right-3 bg-background text-foreground border border-border px-2.5 py-1 rounded-full text-[9px] sm:text-[10px] font-black tracking-wider uppercase shadow-md">
                      Out of stock
                    </div>
                  )}
                  
                  {/* Quick Actions - appear on hover */}
                  <div className={`absolute bottom-3 right-3 flex gap-2 transition-all duration-300 ${hoveredKit === kit.id && !isSizeOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
                    <button 
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleFavorite(kit.id);
                      }}
                      className={`w-9 h-9 border rounded-full flex items-center justify-center transition-colors shadow-lg ${fav ? 'bg-accent border-accent text-accent-foreground' : 'bg-background border-border hover:bg-secondary text-foreground'}`}
                    >
                      <Heart className={`w-4 h-4 ${fav ? 'fill-current' : ''}`} />
                    </button>
                    <button 
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (isOutOfStock) return;
                        setSizeSelectorOpen(kit.id);
                      }}
                      disabled={isOutOfStock}
                      className="w-9 h-9 bg-foreground rounded-full flex items-center justify-center hover:bg-foreground/90 transition-colors shadow-lg disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <ShoppingBag className="w-4 h-4 text-background" />
                    </button>
                  </div>

                  {/* Dynamic Glassmorphic Size Selector Overlay */}
                  {isSizeOpen && (
                    <div className="absolute inset-0 bg-background/85 backdrop-blur-md flex flex-col items-center justify-center p-4 transition-all duration-300 animate-in fade-in duration-200">
                      <p className="text-xs font-black uppercase tracking-wider mb-4 text-foreground/80">Select Jersey Size</p>
                      <div className="flex gap-2">
                        {getSelectableKitSizes(kit).map((size) => {
                          const sizeStock = getKitSizeStock(kit, size)
                          const sizeLabel = getSizeDisplayLabel(kit, size)
                          return (
                          <button
                            key={size}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (sizeStock <= 0) {
                                toast.error(`${sizeLabel} is out of stock`, {
                                  description: "Please pick another available size.",
                                })
                                return;
                              }
                              addToCart(pricedKit, size, {
                                version: "fan",
                                customization: { enabled: false, mode: "plain" },
                              });
                              setSizeSelectorOpen(null);
                            }}
                            aria-disabled={sizeStock <= 0}
                            className={`relative ${isKidsProduct ? "min-w-16 px-2" : "w-10"} h-10 rounded-full border-2 border-foreground text-[10px] font-black transition-all flex items-center justify-center text-center ${sizeStock <= 0 ? "cursor-not-allowed opacity-45 after:absolute after:left-2 after:right-2 after:top-1/2 after:h-0.5 after:-rotate-12 after:bg-current" : "hover:bg-foreground hover:text-background"}`}
                            title={sizeStock <= 0 ? `${sizeLabel} out of stock` : `${sizeLabel} available`}
                          >
                            {sizeLabel}
                          </button>
                          )
                        })}
                      </div>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSizeSelectorOpen(null);
                        }}
                        className="text-[10px] uppercase font-black tracking-widest text-muted-foreground hover:text-foreground mt-5"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                {/* Kit Info */}
                <div className="space-y-1">
                  <h3 className={`font-bold text-sm sm:text-base group-hover:text-accent transition-colors truncate ${mode === "collection" ? "text-white" : ""}`}>
                    {kit.name}
                  </h3>
                  <p className={`text-xs sm:text-sm truncate ${mode === "collection" ? "text-white/58" : "text-muted-foreground"}`}>
                    {kit.club} &bull; {kit.season}
                  </p>
                  <p className={`text-[11px] sm:text-xs truncate ${mode === "collection" ? "text-white/50" : "text-muted-foreground"}`}>
                    {kit.number} &bull; {kit.color}
                  </p>
                  <p className={`text-[11px] sm:text-xs truncate ${mode === "collection" ? "text-white/50" : "text-muted-foreground"}`}>
                    {isMysteryKit ? "Fan, Player, or Master surprise" : isF1Product ? (kit.customizationAvailable ? "Customisable teamwear" : "Normal teamwear") : isKidsProduct ? (kit.customizationAvailable ? "Kids customisable" : "Kids jersey") : isJacketProduct ? "Track jacket" : "Fan jersey"}
                  </p>
                  {!isEmbroideryOnly && !isMysteryKit && !isSingleVersionProduct && (
                    <p className={`text-[11px] sm:text-xs truncate ${mode === "collection" ? "text-white/50" : "text-muted-foreground"}`}>
                      Imported from Thailand
                    </p>
                  )}
                  <div className="flex flex-wrap items-baseline gap-2">
                    <p className="text-lg sm:text-xl font-black text-accent">
                      {isMysteryKit || isSingleVersionProduct ? `₹${cardPrice.toLocaleString("en-IN")}` : `From ₹${(testModeEnabled ? 1 : JERSEY_VERSION_PRICES.fan).toLocaleString("en-IN")}`}
                    </p>
                    {originalPrice && (
                      <p className="text-xs font-bold text-muted-foreground line-through">
                        ₹{originalPrice.toLocaleString("en-IN")}
                      </p>
                    )}
                  </div>
                  {shouldShowStock && (
                    <p className={`text-[10px] font-black uppercase tracking-widest ${isOutOfStock ? "text-red-500" : "text-emerald-500"}`}>
                      {isOutOfStock ? "Out of stock" : "Low stock"}
                    </p>
                  )}
                </div>
              </Link>
              </LazyProductCard>
            );
          })}
        </div>


        {/* Price Range Banner */}
        {mode === "home" && (
        <div className="mt-12 p-6 sm:p-8 rounded-2xl bg-foreground text-background relative overflow-hidden">
          <div className="absolute inset-0 dot-pattern opacity-10" />
          <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <p className="text-accent font-bold text-sm tracking-wider uppercase mb-1">All Jerseys</p>
              <p className="text-2xl sm:text-3xl font-black">{priceRangeLabel}</p>
              <p className="mt-1 text-sm font-bold text-background/80">Highest quality finish premium quality</p>
            </div>
            <div className="flex gap-3 flex-wrap justify-center">
              <span className="px-3 py-1.5 bg-white/10 rounded-full text-xs font-medium">Fan jerseys from ₹999</span>
              <span className="px-3 py-1.5 bg-white/10 rounded-full text-xs font-medium">Premium jersey up to ₹1,499</span>
            </div>
          </div>
        </div>
        )}
      </div>
    </section>
  )
}

function LazyProductCard({ children, index }: { children: ReactNode; index: number; eager?: boolean }) {
  return (
    <div className="min-h-[310px] sm:min-h-[360px]">
      <ProductScrollReveal index={index}>
        {children}
      </ProductScrollReveal>
    </div>
  )
}

function ProductImage({ src, backSrc, alt, priority }: { src: string; backSrc?: string; alt: string; priority?: boolean }) {
  const hasBackImage = Boolean(backSrc && backSrc !== src)

  if (src.startsWith("data:")) {
    return (
      <>
        <img
          src={src}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          data-load-gate={priority ? "true" : undefined}
          className={`absolute inset-0 h-full w-full object-cover transition-all duration-500 ease-out group-hover:scale-105 ${hasBackImage ? "group-hover:opacity-0" : ""}`}
        />
        {hasBackImage && (
          <img
            src={backSrc}
            alt={`${alt} back`}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover opacity-0 transition-all duration-500 ease-out group-hover:scale-105 group-hover:opacity-100"
          />
        )}
      </>
    )
  }

  return (
    <>
      <Image
        src={src}
        alt={alt}
        fill
        className={`object-cover transition-all duration-500 ease-out group-hover:scale-105 ${hasBackImage ? "group-hover:opacity-0" : ""}`}
        sizes="(max-width: 640px) 46vw, (max-width: 1024px) 46vw, 300px"
        quality={100}
        priority={priority}
        data-load-gate={priority ? "true" : undefined}
      />
      {hasBackImage && (
        <Image
          src={backSrc!}
          alt={`${alt} back`}
          fill
          className="object-cover opacity-0 transition-all duration-500 ease-out group-hover:scale-105 group-hover:opacity-100"
          sizes="(max-width: 640px) 46vw, (max-width: 1024px) 46vw, 300px"
          quality={100}
        />
      )}
    </>
  )
}

function CollectionCategoryRail() {
  return (
    <div className="mt-5 flex gap-2 overflow-x-auto pb-1 lg:grid lg:grid-cols-7 lg:overflow-visible">
      {collectionCategories.map((category) => (
        <Link
          key={category.title}
          href={category.href}
          onClick={(event) => {
            if (category.comingSoon) {
              event.preventDefault()
              toast.error("Cricket jerseys are coming soon", { description: "You can request a cricket jersey from the support button." })
            }
          }}
          className="group relative h-20 w-32 shrink-0 overflow-hidden border border-white/10 bg-white/[0.06] sm:w-40 lg:w-full"
        >
          <Image src={category.image} alt={category.title} fill className="object-cover object-top opacity-65 transition-transform duration-500 group-hover:scale-110" sizes="(max-width: 1024px) 160px, 16vw" quality={100} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/88 via-black/25 to-transparent" />
          <span className="absolute bottom-2 right-2 rounded-full border border-white/25 bg-black/55 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-white backdrop-blur-sm">
            {category.shortLabel}
          </span>
        </Link>
      ))}
    </div>
  )
}

function CollectionCategoryGrid() {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
      {collectionCategories.map((category) => (
        <Link
          key={category.title}
          href={category.href}
          onClick={(event) => {
            if (category.comingSoon) {
              event.preventDefault()
              toast.error("Cricket jerseys are coming soon", { description: "You can request a cricket jersey from the support button." })
            }
          }}
          className="group relative min-h-[360px] overflow-hidden border border-white/10 bg-white/[0.06] sm:min-h-[430px] lg:min-h-[480px]"
        >
          <Image
            src={category.image}
            alt={category.title}
            fill
            className="object-cover object-top opacity-80 transition-transform duration-700 group-hover:scale-105"
            sizes="(max-width: 1024px) 100vw, 25vw"
            quality={100}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-black/10 to-black/90" />
          <div className="absolute bottom-0 left-0 right-0 p-5">
            <p className="absolute bottom-5 right-5 rounded-full border border-white/25 bg-black/55 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-red-100 backdrop-blur-sm">{category.shortLabel}</p>
            <h2 className="text-outline-white mt-2 text-4xl font-black uppercase tracking-normal sm:text-5xl">{category.title}</h2>
            <span className="mt-5 inline-flex h-10 items-center gap-2 border border-red-400 px-4 text-[10px] font-black uppercase tracking-widest text-red-100 transition-colors group-hover:bg-red-600 group-hover:text-white">
              Open
              <ArrowRight className="h-4 w-4" />
            </span>
          </div>
        </Link>
      ))}
    </div>
  )
}

const collectionCategories = [
  { title: "Retro", shortLabel: "Retro", href: "/collection?category=retro", image: "/category-retro.png" },
  { title: "World Cup", shortLabel: "WC", href: "/collection?category=world-cup", image: "/category-world-cup.png" },
  { title: "Club Jerseys", shortLabel: "Club", href: "/collection?category=club", image: "/category-club-jerseys.png" },
  { title: "F1", shortLabel: "F1", href: "/collection?category=f1", image: "/category-f1.png" },
  { title: "Jackets", shortLabel: "Jackets", href: "/collection?category=jackets", image: "/category-jackets.png" },
  { title: "Cricket", shortLabel: "Cricket", href: "/collection?category=cricket", image: "/category-cricket.png", comingSoon: true },
]

function getCollectionHeading(filter: { category: string; club: string; sport: string }) {
  const category = filter.category.toLowerCase()
  const club = filter.club.trim()
  const sport = filter.sport.toLowerCase()

  if (club) {
    return {
      badge: "Team Store",
      title: club,
      accent: "Kits",
      description: `Shop ${club} jerseys in the new terrace.fc red and black store layout.`,
    }
  }

  if (category === "retro") {
    return {
      badge: "Archive Picks",
      title: "Retro",
      accent: "Jerseys",
      description: "Classic club shirts and throwback football pieces.",
    }
  }

  if (category === "world-cup") {
    return {
      badge: "International",
      title: "World Cup",
      accent: "Jerseys",
      description: "International football jerseys from the biggest stage.",
    }
  }

  if (category === "f1") {
    return {
      badge: "Formula 1",
      title: "F1",
      accent: "Teamwear",
      description: "Formula 1 team T-shirts and polos from Ferrari, Red Bull, Mercedes and McLaren.",
    }
  }

  if (category === "jackets") {
    return {
      badge: "Outerwear",
      title: "Track",
      accent: "Jackets",
      description: "Lightweight club and international track jackets for the terrace.",
    }
  }

  if (category === "club") {
    return {
      badge: "Club Store",
      title: "Club",
      accent: "Jerseys",
      description: "Current club jerseys, separated from retro classics and international kits.",
    }
  }

  if (category === "kids") {
    return {
      badge: "Kids Store",
      title: "Kids",
      accent: "Jerseys",
      description: "Kids football jersey sets stay in their own section.",
    }
  }

  if (category === "cricket") {
    return {
      badge: "Coming Soon",
      title: "Cricket",
      accent: "Jerseys",
      description: "Cricket jerseys will be added here soon.",
    }
  }

  if (sport === "football") {
    return {
      badge: "Football",
      title: "Football",
      accent: "Jerseys",
      description: "Football jerseys across international, club, retro and special drops.",
    }
  }

  return {
    badge: "New Drop",
    title: "2026",
    accent: "Jerseys",
    description: "The latest current-year football jerseys are back on the main store page.",
  }
}

function isCurrentYearJersey(kit: Pick<EditableKit, "season" | "productType">) {
  const isFootballJersey = (kit.productType || "jersey") === "jersey" || kit.productType === "embroidery"
  const season = String(kit.season || "").toLowerCase()
  return isFootballJersey && (season.includes("2026") || season.includes("2025-26"))
}

function isTrueRetroKit(kit: Pick<EditableKit, "season" | "productType">) {
  if (kit.productType === "f1" || kit.productType === "kids" || kit.productType === "jacket") return false
  const years = String(kit.season || "").match(/\b(?:19|20)\d{2}\b/g)?.map(Number) || []
  if (years.length === 0) return false
  return Math.max(...years) <= 2022
}

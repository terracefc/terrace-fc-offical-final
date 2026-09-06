"use client"

import { useParams, useRouter } from "next/navigation"
import { useSiteSettings } from "@/hooks/use-site-settings"
import { useStore } from "@/lib/store-context"
import { CUSTOMIZATION_PRICE, ORIGINAL_NAME_PRICE, PATCHES_PRICE, getJerseyVersionBasePrice, type JerseyBackOption, type JerseyVersion } from "@/lib/store-context"
import { kits } from "@/lib/data"
import { fetchPublicInventory, getKitSizeStock, getKitStock, getSelectableKitSizes, getSizeDisplayLabel, isKidsKit, readCachedPublicInventory, type EditableKit } from "@/lib/inventory-client"
import { getDisplayKitImages } from "@/lib/kit-images"
import { sortKitsForStorefront } from "@/lib/kit-sorting"
import { EMBROIDERY_ONLY_PRICE, getKitDisplayBadge, getKitSalePrice, isEmbroideryOnlyKit, isRetroJersey } from "@/lib/pricing"
import { getClubPatchOptions, isCurrentClubJersey } from "@/lib/jersey-options"
import { ArrowLeft, CheckCircle2, Heart, PackageCheck, Shield, ShoppingBag, RefreshCw, Truck, Ruler } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CartDrawer } from "@/components/cart-drawer"
import { ProductScrollReveal } from "@/components/product-scroll-reveal"
import Image from "next/image"
import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"

const stories: Record<number, string> = {
  1: "A historic tribute to Arsenal's final season at the iconic Highbury stadium. Thierry Henry captained the Gunners in this deep red-currant and gold-accented jersey, scoring 33 goals across all competitions and cementing his status as one of the greatest Premier League strikers of all time.",
  2: "Ronaldinho's magical 2005-06 season with Barcelona, where his sublime skills, legendary El ClÃ¡sico performance, and infectious smile won him the Ballon d'Or and led BarÃ§a to a La Liga and Champions League double.",
  3: "The height of the legendary MSN trident (Messi, SuÃ¡rez, Neymar). In this gorgeous blue and red hooped jersey, Neymar Jr displayed jaw-dropping dribbling, scoring 31 goals and leading Barcelona to a domestic double (La Liga and Copa del Rey) with unparalleled samba style.",
  4: "Cristiano Ronaldo's record-breaking 2016-17 season with Real Madrid, wearing the purple away kit as they dominated Europe and secured a historic La Liga and Champions League double.",
  5: "Ronaldo Nazario's legendary 2002 World Cup campaign with Brazil, where 'Il Fenomeno' scored 8 goals, including a brace in the final, to secure Brazil's fifth World Cup title.",
  6: "The season Cristiano Ronaldo transformed from a trickster winger into a devastating global superstar. Wearing the legendary #7, Ronaldo scored a breathtaking 42 goals, leading Manchester United to a Premier League and UEFA Champions League double, and securing his first Ballon d'Or.",
  7: "Zlatan Ibrahimovic's dominant 2008-09 Scudetto-winning season with Inter Milan under Jose Mourinho, where he was the Serie A top scorer with 25 goals.",
  8: "Neymar Jr. brings Brazilian flair, creativity, and iconic number 10 energy to the Brazil Home 2026 jersey, carrying the tradition of Brazil's famous yellow and green shirt.",
  9: "Neymar Jr. brings Brazilian flair, creativity, and iconic number 10 energy to the Brazil Away 2026 jersey, representing the skill and confidence that made him one of his generation's most exciting players.",
  10: "Ronaldo Nazario's iconic 1998 World Cup run with Brazil, where he won the Golden Ball after scoring 4 goals and showing unmatched flair.",
  11: "Diego Maradona's legendary 1986 World Cup campaign in Mexico, captaining Argentina to glory and scoring the 'Goal of the Century' against England.",
  12: "David Beckham's treble-winning 1998-99 season with Manchester United, where his pinpoint crosses and free-kick mastery defined a legendary era.",
  13: "Neymar Jr's breakthrough years at Santos, leading them to a historic Copa Libertadores title with his flashy dribbles and spectacular goals.",
  14: "Fernando Torres' early years as 'El NiÃ±o' and captain of his boyhood club Atletico Madrid, showcasing clinical finishing and raw pace.",
  15: "Daniele De Rossi's passionate early 2000s season with AS Roma, embodying the grit, steel, and heart of the Roman midfield.",
  16: "The season Francesco Totti became eternal. Captaining his boyhood club AS Roma to their historic third Scudetto title under Fabio Capello, 'Il Capitano' wore this tight-fitting Kappa jersey, embodying the heart, soul, and pride of the city of Rome.",
  17: "Zlatan Ibrahimovic's dominant 2008-09 Scudetto-winning season with Inter Milan under Jose Mourinho, where he was the Serie A top scorer with 25 goals.",
  18: "Fernando Torres' famous 2011-12 season with Chelsea, culminating in their historic Champions League triumph after his iconic semi-final goal at Camp Nou.",
  19: "The dawn of the 'GalÃ¡cticos' era. David Beckham made his high-profile move from Manchester to Madrid, donning the white jersey with #23. Combining his trademark pinpoint crossing and sublime free-kick mastery with the stardust of Zidane, Ronaldo, and Figo.",
  20: "Sergio Ramos' legendary 2014-15 season with Real Madrid, wearing the white jersey as the ultimate leader and goal-scoring defender.",
  21: "Henrik Larsson's brief but legendary loan spell at Manchester United in 2006-07, where his work ethic and crucial goals won the hearts of the Old Trafford faithful.",
  22: "Diego Maradona's Scudetto-winning 1989-90 season with Napoli, bringing absolute joy and pride to the city of Naples with his majestic football.",
  23: "An iconic era marking the return of 'El Pibe de Oro' to his beloved Boca Juniors. Featuring the legendary yellow band across the deep blue chest, this Quilmes-sponsored jersey encapsulates Maradona's raw passion, flair, and final years showcasing his magic in Argentine football."
};

// Colors and styles for the CSS-rendered back of the jersey
const backStyles: Record<number, {
  name: string;
  nameColor: string;
  numColor: string;
  numBg: string;
  stripeClass?: string;
}> = {
  1: { name: "HENRY", nameColor: "text-[#D4AF37]", numColor: "text-[#D4AF37]", numBg: "bg-[#5C1E2E]" },
  2: { name: "RONALDINHO", nameColor: "text-white", numColor: "text-yellow-500", numBg: "bg-blue-800", stripeClass: "bg-gradient-to-r from-blue-800 via-red-700 to-blue-800" },
  3: { name: "NEYMAR JR", nameColor: "text-[#D4AF37]", numColor: "text-[#D4AF37]", numBg: "bg-blue-800", stripeClass: "bg-gradient-to-r from-blue-800 via-red-700 to-blue-900" },
  4: { name: "RONALDO", nameColor: "text-white", numColor: "text-white", numBg: "bg-purple-700" },
  5: { name: "RONALDO", nameColor: "text-green-600", numColor: "text-green-600", numBg: "bg-yellow-400" },
  6: { name: "RONALDO", nameColor: "text-white", numColor: "text-white", numBg: "bg-red-700" },
  7: { name: "IBRAHIMOVIC", nameColor: "text-white", numColor: "text-blue-500", numBg: "bg-black", stripeClass: "bg-gradient-to-r from-blue-900 via-black to-blue-900" },
  8: { name: "NEYMAR JR", nameColor: "text-green-700", numColor: "text-green-700", numBg: "bg-yellow-400" },
  9: { name: "NEYMAR JR", nameColor: "text-white", numColor: "text-white", numBg: "bg-zinc-800" },
  10: { name: "RONALDO", nameColor: "text-green-600", numColor: "text-green-600", numBg: "bg-yellow-400" },
  11: { name: "MARADONA", nameColor: "text-white", numColor: "text-sky-500", numBg: "bg-white", stripeClass: "bg-gradient-to-r from-sky-400 via-white to-sky-400" },
  12: { name: "BECKHAM", nameColor: "text-white", numColor: "text-white", numBg: "bg-red-700" },
  13: { name: "NEYMAR JR", nameColor: "text-black", numColor: "text-black", numBg: "bg-white" },
  14: { name: "TORRES", nameColor: "text-white", numColor: "text-white", numBg: "bg-red-600", stripeClass: "bg-gradient-to-r from-red-600 via-white to-red-600" },
  15: { name: "DE ROSSI", nameColor: "text-[#D4AF37]", numColor: "text-[#D4AF37]", numBg: "bg-red-800" },
  16: { name: "TOTTI", nameColor: "text-[#D4AF37]", numColor: "text-[#D4AF37]", numBg: "bg-red-800" },
  17: { name: "IBRAHIMOVIC", nameColor: "text-white", numColor: "text-blue-500", numBg: "bg-blue-800" },
  18: { name: "TORRES", nameColor: "text-white", numColor: "text-white", numBg: "bg-blue-700" },
  19: { name: "BECKHAM", nameColor: "text-white", numColor: "text-white", numBg: "bg-zinc-900" },
  20: { name: "S RAMOS", nameColor: "text-black", numColor: "text-black", numBg: "bg-white" },
  21: { name: "LARSSON", nameColor: "text-white", numColor: "text-white", numBg: "bg-red-700" },
  22: { name: "MARADONA", nameColor: "text-white", numColor: "text-white", numBg: "bg-sky-500" },
  23: { name: "MARADONA", nameColor: "text-white", numColor: "text-yellow-500", numBg: "bg-blue-800" }
};

export default function KitDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = Number(params.id)
  
  const { addToCart, toggleFavorite, isFavorite, openCart } = useStore()
  const { testModeEnabled } = useSiteSettings()
  
  const [selectedSize, setSelectedSize] = useState("M")
  const [quantity, setQuantity] = useState(1)
  const [isFlipped, setIsFlipped] = useState(false)
  const [showSizeGuide, setShowSizeGuide] = useState(false)
  const [version, setVersion] = useState<JerseyVersion>("fan")
  const [backOption, setBackOption] = useState<JerseyBackOption>("plain")
  const backOptionsRef = useRef<HTMLDivElement | null>(null)
  const [isBackOptionsHighlighted, setIsBackOptionsHighlighted] = useState(false)
  const [customName, setCustomName] = useState("")
  const [customNumber, setCustomNumber] = useState("")
  const [includePatches, setIncludePatches] = useState(false)
  const [selectedPatchOption, setSelectedPatchOption] = useState("")
  const [includeF1Customisation, setIncludeF1Customisation] = useState(false)
  const [f1CustomName, setF1CustomName] = useState("")
  const [f1CustomNumber, setF1CustomNumber] = useState("")
  const [inventory, setInventory] = useState<EditableKit[]>(() => readCachedPublicInventory(kits))
  const [isInventoryLoading, setIsInventoryLoading] = useState(() => readCachedPublicInventory(kits).length === 0)

  useEffect(() => {
    fetchPublicInventory(kits).then(setInventory).catch(() => null).finally(() => setIsInventoryLoading(false))
  }, [])

  const kit = inventory.find((k) => k.id === id)

  useEffect(() => {
    if (!kit) return
    if (getKitSizeStock(kit, selectedSize) > 0) return

    const firstAvailableSize = getSelectableKitSizes(kit).find((size) => getKitSizeStock(kit, size) > 0)
    if (firstAvailableSize) {
      setSelectedSize(firstAvailableSize)
      setQuantity(1)
    }
  }, [kit, selectedSize])
  
  if (isInventoryLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Loading jersey...</p>
      </div>
    )
  }

  if (!kit) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
        <h2 className="text-2xl font-black mb-4">Jersey not found</h2>
        <Button onClick={() => router.push("/")} className="bg-foreground text-background">
          Back to Home
        </Button>
      </div>
    )
  }

  const isMysteryKit = kit.id === 66
  const isF1Product = kit.productType === "f1" || kit.league === "Formula 1"
  const isKidsProduct = isKidsKit(kit)
  const isJacketProduct = kit.productType === "jacket"
  const isRetroProduct = isRetroJersey(kit)
  const isSingleVersionProduct = isF1Product || isKidsProduct || isJacketProduct || isRetroProduct
  const availableSizes = getSelectableKitSizes(kit)
  const isEmbroideryOnly = isEmbroideryOnlyKit(kit)
  const isEmbroideredSelected = !isMysteryKit && (isEmbroideryOnly || version === "embroidery")
  const baseVersionPrice = isMysteryKit
    ? (testModeEnabled ? 1 : kit.price)
    : isSingleVersionProduct
      ? (testModeEnabled ? 1 : isRetroProduct ? getKitSalePrice(kit) : kit.price)
    : isEmbroideredSelected
      ? (testModeEnabled ? 1 : EMBROIDERY_ONLY_PRICE)
      : getJerseyVersionBasePrice(kit, version, testModeEnabled, backOption)
  const normalizedCustomName = normalizeCustomName(customName)
  const customNo = customNumber.replace(/\D/g, "").slice(0, 2)
  const displayBadge = getKitDisplayBadge(kit)
  const isCurrentWorldCupKit = displayBadge === "2026 WC"
  const isClubJersey = isCurrentClubJersey(kit)
  const clubPatchOptions = getClubPatchOptions(kit)
  const selectedClubPatch = clubPatchOptions.find((option) => option.id === selectedPatchOption) || clubPatchOptions[0]
  const selectedBackOption = isRetroProduct ? "plain" : isCurrentWorldCupKit ? backOption : isClubJersey || backOption === "custom" ? "plain" : backOption
  const hasPatches = (isCurrentWorldCupKit || clubPatchOptions.length > 0) && includePatches
  const unitPrice = testModeEnabled
    ? 1
    : baseVersionPrice
      + (isSingleVersionProduct && includeF1Customisation ? CUSTOMIZATION_PRICE : 0)
      + (!isEmbroideredSelected && selectedBackOption === "custom" ? CUSTOMIZATION_PRICE : 0)
      + (!isEmbroideredSelected && hasPatches ? PATCHES_PRICE : 0)
  const pricedKit = { ...kit, price: unitPrice }
  const originalPrice = testModeEnabled ? null : isEmbroideredSelected ? 699 : unitPrice + 100
  const savings = originalPrice ? originalPrice - pricedKit.price : 0

  const isFav = isFavorite(kit.id)
  const stock = getKitStock(kit)
  const selectedSizeStock = getKitSizeStock(kit, selectedSize)
  const isOutOfStock = stock <= 0
  const isSelectedSizeOutOfStock = selectedSizeStock <= 0
  const shouldShowStock = isOutOfStock || stock <= 5
  const bStyle = backStyles[kit.id] || { name: kit.name.toUpperCase(), nameColor: "text-white", numColor: "text-white", numBg: "bg-foreground" }
  const kitImages = getDisplayKitImages(kit, inventory)
  const backImage = kitImages.backImage
  const preparationLeadTimeDays = 3 + (!isMysteryKit && !isRetroProduct && !isEmbroideredSelected && backOption !== "plain" ? 3 : 0)
  const deliveryTimeline = buildProductDeliveryTimeline(preparationLeadTimeDays)
  const visibleSizeGuideRows = version === "player"
    ? [
      ["S", "34-36", "26"],
      ["M", "36-38", "27"],
      ["L", "38-40", "28"],
      ["XL", "40-42", "29"],
      ["XXL", "42-44", "29.5"],
    ]
    : [
      ["S", "36-37", "27"],
      ["M", "38-39", "28"],
      ["L", "40-41", "29"],
      ["XL", "42-43", "29.5"],
      ["XXL", "44-45", "30"],
    ]

  const handleAddToCart = () => {
    if (isOutOfStock || isSelectedSizeOutOfStock) return
    for (let i = 0; i < quantity; i++) {
      addToCart(pricedKit, selectedSize, isMysteryKit ? {
        version: "fan",
        customization: { enabled: false, mode: "plain" },
      } : isRetroProduct ? {
        version: "plain",
        customization: {
          enabled: false,
          mode: "plain",
          patches: hasPatches,
          patchType: hasPatches ? selectedClubPatch?.label : undefined,
        },
      } : isSingleVersionProduct ? {
        version: "fan",
        customization: {
          enabled: includeF1Customisation,
          mode: includeF1Customisation ? "custom" : "plain",
          name: includeF1Customisation ? normalizeCustomName(f1CustomName) : "",
          number: includeF1Customisation ? f1CustomNumber.replace(/\D/g, "").slice(0, 2) : "",
          f1Custom: includeF1Customisation,
        },
      } : isEmbroideredSelected ? {
        version: "embroidery",
        customization: { enabled: false, mode: "plain" },
      } : {
        version,
        customization: {
          enabled: selectedBackOption === "custom",
          mode: selectedBackOption,
          name: normalizedCustomName,
          number: customNo,
          patches: hasPatches,
          patchType: hasPatches ? (isCurrentWorldCupKit ? "World Cup" : selectedClubPatch?.label) : undefined,
        },
      })
    }
    openCart()
  }

  const handleFlip = () => {
    setIsFlipped((current) => !current)
  }

  const scrollToBackOptionsOnPhone = () => {
    setIsBackOptionsHighlighted(true)
    window.setTimeout(() => setIsBackOptionsHighlighted(false), 1400)
    if (typeof window === "undefined" || window.innerWidth >= 768) return
    window.setTimeout(() => {
      backOptionsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
    }, 80)
  }

  // Find related products
  const relatedKits = sortKitsForStorefront(inventory.filter((k) => {
    if (k.id === kit.id) return false
    const currentType = kit.productType || "jersey"
    const candidateType = k.productType || "jersey"
    if (isF1Product) return candidateType === "f1" && k.club === kit.club
    if (isKidsProduct) return candidateType === "kids" && k.club === kit.club
    if (currentType === "jersey" || currentType === "embroidery") {
      return (candidateType === "jersey" || candidateType === "embroidery") && k.club === kit.club
    }
    return candidateType === currentType
  })).slice(0, 4)

  return (
    <main className="dark min-h-screen pt-24 lg:pt-32 pb-24 relative noise-texture bg-[#080506] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_right,rgba(220,38,38,0.12),transparent_34%),linear-gradient(180deg,rgba(127,29,29,0.12),transparent_40%)]" />
      {/* Dynamic Header Overlay */}
      <div className="fixed top-0 left-0 right-0 z-40 bg-black/85 text-white backdrop-blur-xl border-b border-white/10 h-16 lg:h-20 flex items-center px-4 sm:px-6 lg:px-8">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2 sm:grid-cols-[160px_minmax(0,1fr)_160px]">
          <button 
            onClick={() => router.push("/collection")}
            className="flex min-w-0 items-center gap-2 text-sm font-bold uppercase tracking-wider transition-colors hover:text-accent"
            aria-label="Back to collection"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back to Collection</span>
          </button>
          
          <Link href="/" className="min-w-0 justify-self-start font-black tracking-tight text-2xl transition-colors hover:text-accent sm:text-3xl lg:text-4xl">
            terrace<span className="text-accent">.</span>fc
          </Link>
          
          <Button variant="outline" size="sm" onClick={openCart} className="flex h-10 w-10 items-center justify-center gap-1.5 justify-self-end border-white/20 bg-white/5 px-0 text-white hover:bg-red-600 hover:text-white sm:w-auto sm:px-4">
            <ShoppingBag className="w-4 h-4" />
            <span className="hidden sm:inline">View Cart</span>
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 mt-6 sm:mt-10">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-start">
                   {/* Left Column: Interactive 3D Flipper Showcase */}
          <div className="flex flex-col items-center">
            {/* 3D Perspective Card Wrapper */}
            <div 
              onClick={isMysteryKit ? undefined : handleFlip}
              className={`w-full max-w-[250px] sm:max-w-[400px] aspect-square relative perspective-1000 group ${isMysteryKit ? "" : "cursor-pointer"}`}
            >
              <div 
                className={`w-full h-full duration-500 transform-style-3d transition-transform ${isFlipped ? 'rotate-y-180' : ''}`}
              >
                {/* Front Side Card */}
                <div className={`absolute inset-0 backface-hidden w-full h-full rounded-3xl overflow-hidden shadow-2xl border border-border/40 ${isFlipped ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                  <Image 
                    src={kitImages.image}
                    alt={`${kit.name} Front`}
                    fill
                    className="scale-[1.34] object-contain group-hover:scale-[1.38] transition-transform duration-500"
                    sizes="(max-width: 640px) 92vw, 400px"
                    quality={100}
                    priority
                  />
                  <div className="absolute top-4 left-4 bg-foreground text-background px-3 py-1 rounded-full text-xs font-black tracking-wider uppercase shadow-md">
                    {isMysteryKit ? "MYSTERY KIT" : "FRONT VIEW"}
                  </div>
                </div>

                {/* Back Side Card (Real Cropped Back Image) */}
                {!isMysteryKit && (
                <div className={`absolute inset-0 backface-hidden w-full h-full rounded-3xl overflow-hidden shadow-2xl border border-border/40 rotate-y-180 ${!isFlipped ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                  <Image 
                    src={backImage}
                    alt={`${kit.name} Back`}
                    fill
                    className="scale-[1.34] object-contain group-hover:scale-[1.38] transition-transform duration-500"
                    sizes="(max-width: 640px) 92vw, 400px"
                    quality={100}
                    priority
                  />
                  <div className="absolute top-4 right-4 bg-foreground text-background px-3 py-1 rounded-full text-xs font-black tracking-wider uppercase shadow-md">
                    BACK VIEW
                  </div>
                </div>
                )}
              </div>
            </div>

            {!isMysteryKit && (
            <button 
              onClick={handleFlip}
              className="mt-4 flex items-center gap-2 bg-secondary/80 hover:bg-secondary border border-border/80 px-4 py-2 rounded-full text-[10px] font-black tracking-widest uppercase shadow-md hover:scale-105 hover:shadow-lg transition-all duration-300 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 text-accent transition-transform duration-500 ${isFlipped ? 'rotate-180' : ''}`} />
              <span>FLIP TO SHOW {isFlipped ? 'FRONT' : 'BACK'}</span>
            </button>
            )}
          </div>

          {/* Right Column: E-commerce Details & Cart Adding */}
          <div className="space-y-5">
            <div>
              {/* League & Season */}
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-accent/15 rounded-full text-[10px] font-bold tracking-widest uppercase text-accent mb-3">
                <span className="w-1.5 h-1.5 bg-accent rounded-full" />
                {displayBadge ? `${displayBadge} - ` : ""}{kit.league} &bull; {kit.season}
              </div>
              
              {/* Player Name */}
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-tight mb-1">
                {kit.name}
              </h1>
              
              {/* Club */}
              <p className="text-sm text-muted-foreground font-medium mb-3">
                {isMysteryKit ? "One surprise World Cup jersey" : isF1Product ? `${kit.club} F1 teamwear` : isKidsProduct ? `${kit.club} kids jersey` : isJacketProduct ? `${kit.club} track jacket` : isRetroProduct ? `${kit.club} retro jersey` : getVersionSummary(version, kit.club, isEmbroideryOnly)}
              </p>

              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="inline-flex items-center rounded-full border border-border bg-secondary/40 px-3 py-1 text-xs font-black uppercase tracking-wider">
                  {kit.number}
                </span>
                <span className="inline-flex items-center rounded-full border border-border bg-secondary/40 px-3 py-1 text-xs font-black uppercase tracking-wider">
                  {kit.color}
                </span>
                {shouldShowStock && (
                  <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wider ${isOutOfStock ? "border-red-500/30 bg-red-500/10 text-red-500" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"}`}>
                    {isOutOfStock ? "Out of stock" : "Low stock"}
                  </span>
                )}
              </div>

              {/* Price */}
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="text-3xl sm:text-4xl font-black text-accent">
                  ₹{pricedKit.price.toLocaleString('en-IN')}
                </span>
                {originalPrice && (
                  <span className="text-sm text-muted-foreground line-through">
                    ₹{originalPrice.toLocaleString('en-IN')}
                  </span>
                )}
                {savings > 0 && (
                  <span className="text-xs bg-emerald-500/10 text-emerald-500 font-bold px-2 py-0.5 rounded">
                    Save ₹{savings.toLocaleString("en-IN")}
                  </span>
                )}
              </div>
            </div>

            <hr className="border-border/50" />

            {isSingleVersionProduct && !isRetroProduct && (
              <div className="space-y-3 rounded-2xl border border-border bg-secondary/20 p-4">
                <div>
                  <h3 className="font-bold text-xs uppercase tracking-widest text-muted-foreground">{isKidsProduct ? "Kids Jersey" : isJacketProduct ? "Track Jacket" : "F1 Teamwear"}</h3>
                  <p className="mt-1 text-sm font-bold text-muted-foreground">
                    One version at ₹{kit.price.toLocaleString("en-IN")}. Select customisation if you want the add-on.
                  </p>
                </div>
                {kit.customizationAvailable ? (
                  <>
                    <label className={`flex cursor-pointer items-center justify-between gap-4 rounded-xl border p-3 transition-colors ${includeF1Customisation ? "border-accent bg-accent/10" : "border-border hover:bg-secondary/40"}`}>
                      <span>
                        <span className="block text-xs font-black uppercase tracking-widest">Customisation</span>
                        <span className="mt-1 block text-xs text-muted-foreground">Add your name and number for ₹{CUSTOMIZATION_PRICE.toLocaleString("en-IN")}.</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={includeF1Customisation}
                        onChange={(event) => setIncludeF1Customisation(event.target.checked)}
                        className="h-5 w-5 shrink-0 accent-[var(--accent)]"
                      />
                    </label>
                    {includeF1Customisation && (
                      <div className="grid grid-cols-[1fr_96px] gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
                        <label className="space-y-1">
                          <span className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">Name</span>
                          <input
                            value={f1CustomName}
                            onChange={(event) => setF1CustomName(normalizeCustomName(event.target.value))}
                            placeholder="YOUR NAME"
                            maxLength={14}
                            className="h-11 w-full rounded-xl border border-border bg-secondary/30 px-3 text-sm font-black uppercase outline-none focus:border-accent"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">Number</span>
                          <input
                            value={f1CustomNumber}
                            onChange={(event) => setF1CustomNumber(event.target.value.replace(/\D/g, "").slice(0, 2))}
                            placeholder="44"
                            inputMode="numeric"
                            maxLength={2}
                            className="h-11 w-full rounded-xl border border-border bg-secondary/30 px-3 text-sm font-black uppercase outline-none focus:border-accent"
                          />
                        </label>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="rounded-xl border border-border bg-background/60 p-3 text-xs font-bold text-muted-foreground">
                    This item is available as normal teamwear only.
                  </p>
                )}
              </div>
            )}

            {!isMysteryKit && !isSingleVersionProduct && (
            <div className="space-y-3">
              <h3 className="font-bold text-xs uppercase tracking-widest text-muted-foreground">Jersey Version</h3>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 sm:gap-2">
                {([
                  ["fan", "Fan", getJerseyVersionBasePrice(kit, "fan", testModeEnabled, "plain"), "Supporter fit with a lighter finish. Comes with shorts."],
                  ["master", "Master", getJerseyVersionBasePrice(kit, "master", testModeEnabled, "plain"), "Embroidered logos with heat-pressed sponsors, names, and numbers."],
                  ["player", "Player", getJerseyVersionBasePrice(kit, "player", testModeEnabled, "plain"), "Highest-detail tighter fit with heat-pressed sponsors, names, and numbers."],
                ] as const).map(([value, label, price, description]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setVersion(value)
                      scrollToBackOptionsOnPhone()
                    }}
                    className={`rounded-lg border p-1.5 text-left transition-colors sm:p-2 ${version === value ? "border-accent bg-accent/10 text-accent" : "border-border hover:bg-secondary/40"}`}
                  >
                    <span className="block text-[10px] font-black uppercase tracking-widest">{label}</span>
                    <span className="mt-0.5 block text-xs font-black">₹{price.toLocaleString("en-IN")}</span>
                    <span className="mt-1 block text-[10px] leading-tight text-muted-foreground">{description}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {getVersionDetail(version, isEmbroideryOnly)}
              </p>

              {!isEmbroideredSelected && isClubJersey ? (
                <div ref={backOptionsRef} className={`scroll-mt-28 space-y-2 rounded-2xl transition-all duration-300 ${isBackOptionsHighlighted ? "bg-accent/10 p-3 shadow-[0_0_0_2px_rgba(212,255,63,0.55),0_0_32px_rgba(212,255,63,0.35)] ring-1 ring-accent/60" : "p-0"}`}>
                  <h3 className="font-bold text-xs uppercase tracking-widest text-muted-foreground">Back Print</h3>
                  <div className="rounded-lg border border-accent bg-accent/10 p-2 text-left text-accent">
                    <span className="block text-[10px] font-black uppercase tracking-widest">No Name</span>
                    <span className="mt-1 block text-[10px] leading-tight text-muted-foreground">Plain back with nothing printed.</span>
                  </div>
                </div>
              ) : !isEmbroideredSelected && (
                <div ref={backOptionsRef} className={`scroll-mt-28 space-y-2 rounded-2xl transition-all duration-300 ${isBackOptionsHighlighted ? "bg-accent/10 p-3 shadow-[0_0_0_2px_rgba(212,255,63,0.55),0_0_32px_rgba(212,255,63,0.35)] ring-1 ring-accent/60" : "p-0"}`}>
                  <h3 className="font-bold text-xs uppercase tracking-widest text-muted-foreground">Back Print</h3>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3 sm:gap-2">
                    {([
                      ["plain", "No Name", `Plain back with nothing printed. Fan ₹${getJerseyVersionBasePrice(kit, "fan", testModeEnabled, "plain").toLocaleString("en-IN")} / Player ₹${getJerseyVersionBasePrice(kit, "player", testModeEnabled, "plain").toLocaleString("en-IN")} / Master ₹${getJerseyVersionBasePrice(kit, "master", testModeEnabled, "plain").toLocaleString("en-IN")}.`],
                      ["original", "Original Name", `Gets the same player name and number shown in the product photo. Add ₹${ORIGINAL_NAME_PRICE.toLocaleString("en-IN")} and 3 extra business days.`],
                      ...(isCurrentWorldCupKit ? [["custom", "Custom Name", `Add your own name and number. Add ₹${CUSTOMIZATION_PRICE.toLocaleString("en-IN")} and 3 extra business days.`] as const] : []),
                    ] as const).map(([value, label, description]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          setBackOption(value)
                          if (value !== "original") setIsFlipped(true)
                        }}
                        className={`rounded-lg border p-2 text-left transition-colors ${backOption === value ? "border-accent bg-accent/10 text-accent" : "border-border hover:bg-secondary/40"}`}
                      >
                        <span className="block text-[10px] font-black uppercase tracking-widest">{label}</span>
                        <span className="mt-1 block text-[10px] leading-tight text-muted-foreground">{description}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!isEmbroideredSelected && isCurrentWorldCupKit && backOption === "custom" && (
                <div className="grid grid-cols-[1fr_96px] gap-3">
                  <label className="space-y-1">
                    <span className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">Name</span>
                    <input
                      value={customName}
                      onFocus={() => setIsFlipped(true)}
                      onChange={(event) => setCustomName(normalizeCustomName(event.target.value))}
                      placeholder="YOUR NAME"
                      maxLength={14}
                      className="h-11 w-full rounded-xl border border-border bg-secondary/30 px-3 text-sm font-black uppercase outline-none focus:border-accent"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">Number</span>
                    <input
                      value={customNo}
                      onFocus={() => setIsFlipped(true)}
                      onChange={(event) => setCustomNumber(event.target.value.replace(/\D/g, "").slice(0, 2))}
                      placeholder="10"
                      inputMode="numeric"
                      maxLength={2}
                      className="h-11 w-full rounded-xl border border-border bg-secondary/30 px-3 text-sm font-black uppercase outline-none focus:border-accent"
                    />
                  </label>
                </div>
              )}

              {!isEmbroideredSelected && clubPatchOptions.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="font-bold text-xs uppercase tracking-widest text-muted-foreground">Patches</h3>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3 sm:gap-2">
                    <button
                      type="button"
                      onClick={() => setIncludePatches(false)}
                      className={`rounded-lg border p-2 text-left transition-colors ${!includePatches ? "border-accent bg-accent/10 text-accent" : "border-border hover:bg-secondary/40"}`}
                    >
                      <span className="block text-[10px] font-black uppercase tracking-widest">No Patches</span>
                      <span className="mt-1 block text-[10px] leading-tight text-muted-foreground">Keep the sleeves plain.</span>
                    </button>
                    {clubPatchOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          setSelectedPatchOption(option.id)
                          setIncludePatches(true)
                        }}
                        className={`rounded-lg border p-2 text-left transition-colors ${includePatches && selectedClubPatch?.id === option.id ? "border-accent bg-accent/10 text-accent" : "border-border hover:bg-secondary/40"}`}
                      >
                        <span className="block text-[10px] font-black uppercase tracking-widest">{option.label}</span>
                        <span className="mt-1 block text-[10px] leading-tight text-muted-foreground">{option.description} Add ₹{PATCHES_PRICE}.</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : !isEmbroideredSelected && isCurrentWorldCupKit && (
                <label className={`flex cursor-pointer items-center justify-between gap-4 rounded-xl border p-3 transition-colors ${includePatches ? "border-accent bg-accent/10" : "border-border hover:bg-secondary/40"}`}>
                  <span>
                    <span className="block text-xs font-black uppercase tracking-widest">Patches</span>
                    <span className="mt-1 block text-xs text-muted-foreground">Add official-style sleeve patches for ₹{PATCHES_PRICE}.</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={includePatches}
                    onChange={(event) => setIncludePatches(event.target.checked)}
                    className="h-5 w-5 shrink-0 accent-[var(--accent)]"
                  />
                </label>
              )}
            </div>
            )}
            {isRetroProduct && clubPatchOptions.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-bold text-xs uppercase tracking-widest text-muted-foreground">Patches</h3>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3 sm:gap-2">
                  <button
                    type="button"
                    onClick={() => setIncludePatches(false)}
                    className={`rounded-lg border p-2 text-left transition-colors ${!includePatches ? "border-accent bg-accent/10 text-accent" : "border-border hover:bg-secondary/40"}`}
                  >
                    <span className="block text-[10px] font-black uppercase tracking-widest">No Patches</span>
                    <span className="mt-1 block text-[10px] leading-tight text-muted-foreground">Keep the sleeves plain.</span>
                  </button>
                  {clubPatchOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setSelectedPatchOption(option.id)
                        setIncludePatches(true)
                      }}
                      className={`rounded-lg border p-2 text-left transition-colors ${includePatches && selectedClubPatch?.id === option.id ? "border-accent bg-accent/10 text-accent" : "border-border hover:bg-secondary/40"}`}
                    >
                      <span className="block text-[10px] font-black uppercase tracking-widest">{option.label}</span>
                      <span className="mt-1 block text-[10px] leading-tight text-muted-foreground">{option.description} Add ₹{PATCHES_PRICE}.</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {isMysteryKit && (
              <div className="rounded-xl border border-accent/20 bg-accent/5 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-accent">Mystery Kit</p>
                <p className="mt-1 text-sm font-bold text-muted-foreground">
                  You select the size. The jersey version is a surprise, with a chance to receive Fan, Player, or Master version.
                </p>
              </div>
            )}

            <hr className="border-border/50" />

            <div className="rounded-xl border border-border bg-secondary/20 p-3">
              <div className="grid grid-cols-[1fr_32px_1fr_32px_1fr] items-center gap-2">
                {deliveryTimeline.map((step, index) => (
                  <div key={step.label} className="contents">
                    <div className="flex min-w-0 flex-col items-center text-center">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-accent/30 bg-accent/10 text-accent">
                        {step.icon}
                      </div>
                      <p className="mt-1.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground">{step.date}</p>
                      <p className="text-[11px] font-black">{step.label}</p>
                    </div>
                    {index < deliveryTimeline.length - 1 && (
                      <div className="h-px w-full bg-border" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Size Selector */}
            <div className="space-y-4">
              <div className="flex justify-between items-baseline">
                <h3 className="font-bold text-xs uppercase tracking-widest text-muted-foreground">Select Size</h3>
                {!isF1Product && (
                  <button
                    type="button"
                    onClick={() => setShowSizeGuide((current) => !current)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-accent hover:underline"
                  >
                    <Ruler className="h-3.5 w-3.5" />
                    Size Guide
                  </button>
                )}
              </div>
              {showSizeGuide && !isF1Product && (
                <div className="rounded-2xl border border-border bg-secondary/25 p-4">
                  <div className="grid grid-cols-[52px_1fr_1fr] gap-x-3 gap-y-2 text-xs">
                    <p className="font-black uppercase tracking-widest text-muted-foreground">Size</p>
                    <p className="font-black uppercase tracking-widest text-muted-foreground">Chest</p>
                    <p className="font-black uppercase tracking-widest text-muted-foreground">Length</p>
                    {visibleSizeGuideRows.map(([size, chest, length]) => (
                      <div key={size} className="contents">
                        <p className="font-black">{size}</p>
                        <p className="text-muted-foreground">{chest} in</p>
                        <p className="text-muted-foreground">{length} in</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                    {version === "player" ? "Player Version is a tighter athletic fit, so choose one size up if you want it loose over a tee." : "Fan and Master use the regular supporter fit."}
                  </p>
                </div>
              )}
              <div className="flex gap-3">
                {availableSizes.map((size) => {
                  const sizeStock = getKitSizeStock(kit, size)
                  const sizeLabel = getSizeDisplayLabel(kit, size)
                  return (
                    <button
                      key={size}
                      onClick={() => {
                        if (sizeStock <= 0) {
                          toast.error(`${sizeLabel} is out of stock`, {
                            description: "Please pick another available size.",
                          })
                          return
                        }
                        setSelectedSize(size)
                        setQuantity(1)
                      }}
                      aria-disabled={sizeStock <= 0}
                      className={`relative min-h-12 ${isKidsProduct ? "min-w-[92px] px-2" : "w-12"} rounded-xl border-2 font-black text-xs transition-all flex items-center justify-center text-center ${sizeStock <= 0 ? "cursor-not-allowed opacity-45 after:absolute after:left-2 after:right-2 after:top-1/2 after:h-0.5 after:-rotate-12 after:bg-current" : "cursor-pointer"} ${selectedSize === size ? 'border-accent bg-accent/10 text-accent font-black shadow-md' : 'border-border hover:bg-secondary text-foreground'}`}
                      title={sizeStock <= 0 ? `${sizeLabel} out of stock` : `${sizeLabel} available`}
                    >
                      {sizeLabel}
                    </button>
                  )
                })}
              </div>
              {!isOutOfStock && (
                <p className={`text-xs font-black uppercase tracking-widest ${isSelectedSizeOutOfStock ? "text-red-500" : "text-emerald-500"}`}>
                  {isSelectedSizeOutOfStock ? `${getSizeDisplayLabel(kit, selectedSize)} out of stock` : `${getSizeDisplayLabel(kit, selectedSize)} available`}
                </p>
              )}
            </div>

            {/* Quantity and Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 pt-2">
              {/* Quantity Select */}
              <div className="flex items-center justify-between border border-border rounded-2xl h-14 px-4 sm:w-36 bg-secondary/20">
                <button 
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  disabled={isOutOfStock}
                  className="p-1 hover:bg-secondary rounded-lg transition-colors font-bold text-lg disabled:cursor-not-allowed disabled:opacity-40"
                >
                  -
                </button>
                <span className="font-bold select-none text-base">{quantity}</span>
                <button 
                  onClick={() => setQuantity(Math.min(selectedSizeStock, quantity + 1))}
                  disabled={isOutOfStock || isSelectedSizeOutOfStock || quantity >= selectedSizeStock}
                  className="p-1 hover:bg-secondary rounded-lg transition-colors font-bold text-lg disabled:cursor-not-allowed disabled:opacity-40"
                >
                  +
                </button>
              </div>

              {/* Add to Cart button */}
              <Button 
                onClick={handleAddToCart}
                disabled={isOutOfStock || isSelectedSizeOutOfStock}
                className="flex-1 bg-foreground text-background hover:bg-foreground/95 h-14 rounded-2xl text-sm font-black uppercase tracking-wider shadow-lg hover:shadow-2xl transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>{isOutOfStock ? "Out of Stock" : isSelectedSizeOutOfStock ? "Select Available Size" : `Add ${quantity} to Cart - ₹${(unitPrice * quantity).toLocaleString('en-IN')}`}</span>
              </Button>

              {/* Wishlist toggle */}
              <button 
                onClick={() => toggleFavorite(kit.id)}
                className={`w-14 h-14 border rounded-2xl flex items-center justify-center transition-colors cursor-pointer ${isFav ? 'bg-accent/10 border-accent/30 text-accent shadow-md' : 'bg-transparent border-border hover:bg-secondary text-foreground'}`}
              >
                <Heart className={`w-5 h-5 ${isFav ? 'fill-current' : ''}`} />
              </button>
            </div>

            {/* Shipping details / Trust indicators */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 text-xs text-muted-foreground border-t border-border/40">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-accent flex-shrink-0" />
                <span>Delivery time depends on your location.</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-accent flex-shrink-0" />
                <span>100% High Quality</span>
              </div>
            </div>

          </div>
        </div>

        {/* Dynamic Carousel: Related Legends */}
        <div className="mt-24 border-t border-border/50 pt-16">
          <h2 className="text-3xl font-black tracking-tight mb-8">
            You May <span className="text-accent font-serif italic">Also</span> Like
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 lg:gap-6">
            {relatedKits.map((relatedKit, index) => (
              <ProductScrollReveal key={relatedKit.id} index={index}>
                <div 
                  onClick={() => {
                    router.push(`/kit/${relatedKit.id}`);
                    setSelectedSize("M");
                    setQuantity(1);
                    setIsFlipped(false);
                  }}
                  className="group cursor-pointer space-y-3"
                >
                  <div className="aspect-square rounded-2xl overflow-hidden relative shadow-sm border border-border/40 group-hover:shadow-lg group-hover:scale-[1.02] transition-all duration-300">
                    <Image 
                      src={relatedKit.image}
                      alt={relatedKit.name}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 45vw, 240px"
                      quality={100}
                    />
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="font-bold text-sm truncate group-hover:text-accent transition-colors">{relatedKit.name}</h4>
                    <p className="text-xs text-muted-foreground truncate">{relatedKit.club} &bull; {relatedKit.season}</p>
                    <p className="text-sm font-black text-accent">₹{getKitSalePrice(relatedKit, testModeEnabled).toLocaleString('en-IN')}</p>
                  </div>
                </div>
              </ProductScrollReveal>
            ))}
          </div>
        </div>

      </div>
      <CartDrawer />
    </main>
  )
}

function normalizeCustomName(value: string) {
  return value.replace(/[^a-zA-Z ]/g, "").toUpperCase().slice(0, 14)
}

function buildProductDeliveryTimeline(preparationDays = 0) {
  const today = new Date()
  const arrivalDays = Math.max(3, preparationDays || 3)
  const deliveryDays = arrivalDays + 5
  return [
    {
      label: "Confirmed",
      date: formatTimelineDate(today),
      icon: <CheckCircle2 className="h-5 w-5" />,
    },
    {
      label: "Dispatched",
      date: formatTimelineDate(addTimelineDays(today, arrivalDays)),
      icon: <Truck className="h-5 w-5" />,
    },
    {
      label: "Delivered",
      date: formatTimelineDate(addTimelineDays(today, deliveryDays)),
      icon: <PackageCheck className="h-5 w-5" />,
    },
  ]
}

function addTimelineDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function formatTimelineDate(date: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    weekday: "short",
  }).format(date)
}

function getVersionSummary(version: JerseyVersion, club: string, isEmbroideryOnly = false) {
  if (isEmbroideryOnly || version === "embroidery") return `${club} embroidered logo finish`
  if (version === "master") return `${club} Master Version`
  if (version === "player") return `${club} Player Version`
  return `${club} Fan Version`
}

function getVersionDetail(version: JerseyVersion, isEmbroideryOnly = false) {
  if (isEmbroideryOnly || version === "embroidery") return "Embroidered option: logos are embroidered only, with no back name or sponsor-name add-ons."
  if (version === "master") return "Master Version: embroidered logos with heat-pressed sponsors, names, and numbers. Original and custom back names are available as add-ons."
  if (version === "player") return "Player Version: the highest-detail jersey quality with a tighter athletic fit, plus heat-pressed sponsor, name, and number options."
  return "Fan Version: a cleaner supporter-quality jersey with less detail than Player. Comes with shorts and is still available with original or custom heat-pressed names."
}

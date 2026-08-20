"use client"

import { useStore } from "@/lib/store-context"
import { kits } from "@/lib/data"
import { fetchPublicInventory, readCachedPublicInventory, type EditableKit } from "@/lib/inventory-client"
import { getDisplayKitImages } from "@/lib/kit-images"
import { sortKitsForStorefront } from "@/lib/kit-sorting"
import { getKitSalePrice } from "@/lib/pricing"
import { X, Search } from "lucide-react"
import Image from "next/image"
import { useDeferredValue, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

export function SearchModal() {
  const router = useRouter()
  const { 
    isSearchOpen, 
    closeSearch, 
    searchQuery, 
    setSearchQuery,
  } = useStore()

  const [publishedKits, setPublishedKits] = useState<EditableKit[]>(() => readCachedPublicInventory(kits))
  const [submittedNoMatch, setSubmittedNoMatch] = useState("")
  const deferredSearchQuery = useDeferredValue(searchQuery)

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

  const handleKeywordClick = (term: string) => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchQuery(term);
    } else {
      const words = query.split(/\s+/);
      if (!words.includes(term)) {
        setSearchQuery(`${query} ${term}`);
      }
    }
  };

  const searchableKits = useMemo(() => {
    return publishedKits.map((kit) => ({
      kit,
      searchText: getKitSearchText(kit),
      salePrice: getKitSalePrice(kit).toString(),
    }))
  }, [publishedKits])

  const queryWords = useMemo(() => {
    return deferredSearchQuery.toLowerCase().trim().split(/\s+/).filter(word => word.length > 0)
  }, [deferredSearchQuery])

  const filteredKits = useMemo(() => {
    if (queryWords.length === 0) return []

    return sortKitsForStorefront(searchableKits.filter(({ kit, searchText, salePrice }) => 
        queryWords.every(word => {
          const w = word.toLowerCase();
          
          // Smart Decade / Era Mapping
          if (w === "80s" || w === "1980s") {
            return String(kit.season || "").includes("198");
          }
          if (w === "90s" || w === "1990s") {
            const season = String(kit.season || "").toLowerCase()
            return season.includes("199") || season.includes("90s");
          }
          if (w === "00s" || w === "2000s") {
            const season = String(kit.season || "").toLowerCase()
            return season.includes("200") || season.includes("00s");
          }
          if (w === "10s" || w === "2010s") {
            const season = String(kit.season || "").toLowerCase()
            return season.includes("201") || season.includes("10s");
          }
          if (w === "retro" || w === "classic" || w === "vintage") {
            const season = String(kit.season || "").toLowerCase()
            const badge = String(kit.badge || "").toLowerCase()
            const matchYear = season.match(/\d{4}/);
            const year = matchYear ? parseInt(matchYear[0]) : null;
            return (
              searchText.includes(w) ||
              badge === "classic" ||
              badge === "legend" ||
              (w === "retro" && year !== null && year < 2020) ||
              (w === "vintage" && year !== null && year < 2010) ||
              season.includes("early 2000s")
            );
          }

          return searchText.includes(w) || salePrice.includes(w);
        })
      ).map(({ kit }) => kit))
  }, [queryWords, searchableKits])

  const closestKit = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return null

    return searchableKits
      .map(({ kit, searchText }) => ({
        kit,
        score: scoreSearchMatch(query, searchText),
      }))
      .sort((left, right) => right.score - left.score)[0] || null
  }, [searchQuery, searchableKits])

  const submitSearch = () => {
    const query = searchQuery.trim()
    if (!query) return

    const target = filteredKits[0] || (closestKit && closestKit.score >= 2 ? closestKit.kit : null)
    if (target) {
      closeSearch()
      router.push(`/kit/${target.id}`)
      return
    }

    setSubmittedNoMatch(query)
  }

  if (!isSearchOpen) return null

  const categories = [
    {
      title: "Clubs",
      items: [
        { label: "Arsenal", value: "Arsenal" },
        { label: "Real Madrid", value: "Real Madrid" },
        { label: "Barcelona", value: "Barcelona" },
        { label: "Man United", value: "Manchester" },
        { label: "AC Milan", value: "Milan" },
        { label: "Napoli", value: "Napoli" },
        { label: "Boca Juniors", value: "Boca" }
      ]
    },
    {
      title: "Eras & Dates",
      items: [
        { label: "Retro", value: "retro" },
        { label: "Vintage", value: "vintage" },
        { label: "Modern 2026", value: "2026" },
        { label: "80s Retro", value: "80s" },
        { label: "90s Classic", value: "90s" },
        { label: "2000s Vintage", value: "2000s" },
        { label: "2010s Modern", value: "2010s" }
      ]
    },
    {
      title: "Kit Types",
      items: [
        { label: "Home", value: "home" },
        { label: "Away", value: "away" },
        { label: "Third Kits", value: "third" },
        { label: "Long Sleeve", value: "long sleeve" },
        { label: "World Cup", value: "world cup" },
        { label: "Nike", value: "nike" },
        { label: "Adidas", value: "adidas" },
        { label: "Jordan", value: "jordan" }
      ]
    },
    {
      title: "Leagues",
      items: [
        { label: "National Teams", value: "national" },
        { label: "Club Kits", value: "club" },
        { label: "Premier League", value: "Premier" },
        { label: "La Liga", value: "Liga" },
        { label: "Serie A", value: "Serie" },
        { label: "International", value: "International" }
      ]
    },
    {
      title: "Legendary Players",
      items: [
        { label: "Maradona", value: "Maradona" },
        { label: "Ronaldo", value: "Ronaldo" },
        { label: "Ronaldinho", value: "Ronaldinho" },
        { label: "Henry", value: "Henry" },
        { label: "Beckham", value: "Beckham" },
        { label: "Neymar Jr", value: "Neymar" },
        { label: "Totti", value: "Totti" }
      ]
    }
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex items-start justify-center pt-24 px-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-md transition-opacity duration-300"
        onClick={closeSearch}
      />

      {/* Modal panel */}
      <div className="w-full max-w-2xl transform transition-all duration-300 ease-out bg-background border border-border flex flex-col shadow-2xl rounded-3xl overflow-hidden relative z-10">
        
        {/* Search bar header */}
        <div className="p-6 border-b border-border flex items-center gap-4">
          <Search className="w-6 h-6 text-muted-foreground flex-shrink-0" />
          <input 
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setSubmittedNoMatch("")
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                submitSearch()
              }
            }}
            placeholder="Search jerseys, teams, players or leagues..."
            className="flex-1 bg-transparent border-0 outline-none text-lg placeholder:text-muted-foreground/60 text-foreground font-medium"
            autoFocus
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery("")}
              className="text-muted-foreground hover:text-foreground text-xs uppercase font-bold tracking-widest"
            >
              Clear
            </button>
          )}
          <button 
            onClick={closeSearch}
            className="p-2 hover:bg-secondary rounded-full transition-colors flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search results body */}
        <div className="flex-1 max-h-[400px] overflow-y-auto p-6">
          {searchQuery.trim() === "" ? (
            <div className="space-y-6 py-4">
              <p className="text-center text-muted-foreground text-sm font-medium">Quick search keywords</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-xl mx-auto text-left">
                {categories.map((cat) => (
                  <div key={cat.title} className="space-y-2">
                    <h5 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/80 pl-1">{cat.title}</h5>
                    <div className="flex flex-wrap gap-1.5">
                      {cat.items.map((item) => (
                        <button
                          key={item.label}
                          onClick={() => handleKeywordClick(item.value)}
                          className="px-3 py-1.5 bg-secondary/40 hover:bg-secondary border border-border/40 text-[11px] font-bold rounded-xl transition-colors cursor-pointer"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Active Filter Badges */}
              <div className="flex flex-wrap gap-2 items-center pb-2 border-b border-border/40">
                <span className="text-[10px] font-black tracking-widest text-muted-foreground/60 uppercase">Active:</span>
                {queryWords.map((word, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      const newWords = queryWords.filter((_, i) => i !== idx);
                      setSearchQuery(newWords.join(" "));
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-accent/10 hover:bg-accent/20 border border-accent/20 text-accent text-xs font-bold rounded-full transition-colors cursor-pointer"
                  >
                    <span>{word}</span>
                    <span className="text-accent/60 hover:text-accent font-medium">x</span>
                  </button>
                ))}
              </div>

              {filteredKits.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground space-y-3">
                  <Search className="w-8 h-8 mx-auto text-muted-foreground/45" />
                  <p className="font-bold text-sm">Sorry, we do not have &quot;{submittedNoMatch || searchQuery}&quot; right now.</p>
                  <p className="text-xs text-muted-foreground/80">Try checking spelling or search for another keyword like &quot;Henry&quot; or &quot;Retro&quot;.</p>
                  <p className="text-sm font-bold text-foreground">
                    Would you like to{" "}
                    <Link
                      href="/request-jersey"
                      onClick={closeSearch}
                      className="text-accent underline decoration-2 underline-offset-4 hover:text-accent/80"
                    >
                      Request a jersey
                    </Link>
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase mb-2">
                    Matching Jerseys ({filteredKits.length})
                  </p>
                  {filteredKits.map((kit) => {
                    const kitImages = getDisplayKitImages(kit, publishedKits)

                    return (
                      <div key={kit.id} className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm transition-all hover:border-zinc-400">
                    <Link 
                      href={`/kit/${kit.id}`} 
                      onClick={closeSearch}
                      className="flex min-w-0 items-center gap-4 cursor-pointer group/item"
                    >
                      <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl border border-white/20 bg-white shadow-sm transition-transform group-hover/item:scale-[1.03] sm:h-28 sm:w-28">
                        <ProductImage src={kitImages.image} alt={kit.name} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-black leading-snug text-zinc-950 transition-colors group-hover/item:text-accent sm:text-base">{getSearchResultTitle(kit)}</h4>
                      </div>
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
        </div>
      </div>
    </div>
  )
}

function getKitSearchText(kit: EditableKit) {
  const productTerms = kit.productType === "f1"
    ? "formula 1 f1 teamwear"
    : kit.productType === "jacket"
      ? "football track jacket"
      : "football jersey football kit football shirt club jersey"

  const values = [
    kit.name,
    kit.club,
    kit.season,
    kit.league,
    kit.number,
    kit.color,
    kit.badge || "",
    kit.description || "",
    productTerms,
    getKitTags(kit).join(" "),
    getKitSearchAliases(kit).join(" "),
  ]

  return values.join(" ").toLowerCase()
}

function getSearchResultTitle(kit: EditableKit) {
  const kitType = String(kit.season || "").match(/\b(home|away|third|fourth|pre-match)\b/i)?.[1]
  const year = String(kit.season || "").match(/\b20\d{2}(?:[-/]\d{2})?\b/)?.[0]
  if (kitType) return `${kit.club} ${kitType[0].toUpperCase()}${kitType.slice(1).toLowerCase()}${year ? ` ${year}` : ""}`
  return kit.name
}

function scoreSearchMatch(query: string, searchText: string) {
  const normalizedQuery = normalizeSearchValue(query)
  const normalizedText = normalizeSearchValue(searchText)
  if (!normalizedQuery || !normalizedText) return 0
  if (normalizedText.includes(normalizedQuery)) return 100 + normalizedQuery.length

  const queryWords = normalizedQuery.split(" ").filter(Boolean)
  const textWords = normalizedText.split(" ").filter(Boolean)

  return queryWords.reduce((score, word) => {
    if (normalizedText.includes(word)) return score + Math.max(4, word.length)
    const closestDistance = textWords.reduce((best, textWord) => Math.min(best, levenshteinDistance(word, textWord)), 99)
    if (word.length >= 4 && closestDistance <= 2) return score + Math.max(2, word.length - closestDistance)
    return score
  }, 0)
}

function normalizeSearchValue(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()
}

function levenshteinDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  const current = Array(right.length + 1).fill(0)

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      )
    }
    for (let j = 0; j <= right.length; j += 1) previous[j] = current[j]
  }

  return previous[right.length]
}

function getKitTags(kit: EditableKit) {
  const tags = new Set<string>()
  const season = String(kit.season || "").toLowerCase()
  const club = String(kit.club || "").toLowerCase()
  const league = String(kit.league || "").toLowerCase()
  const text = `${kit.name} ${kit.club} ${kit.season} ${kit.color} ${kit.description || ""}`.toLowerCase()
  const year = Number(season.match(/\b(19|20)\d{2}\b/)?.[0] || "")

  if (year && year < 2020) tags.add("retro")
  if (year && year < 2010) tags.add("vintage")
  if (String(kit.badge || "").toLowerCase().includes("classic")) tags.add("retro")
  if (season.includes("home")) tags.add("home")
  if (season.includes("away")) tags.add("away")
  if (season.includes("third") || season.includes("3rd")) tags.add("third")
  if (season.includes("long sleeve")) tags.add("long sleeve")
  if (season.includes("short sleeve")) tags.add("short sleeve")
  if (league.includes("international") || isNationalTeam(club)) tags.add("national")
  if (!league.includes("international") && !isNationalTeam(club)) tags.add("club")
  if (text.includes("nike")) tags.add("nike")
  if (text.includes("adidas")) tags.add("adidas")
  if (text.includes("jordan")) tags.add("jordan")
  if (text.includes("world cup")) tags.add("world cup")
  if (text.includes("ronaldo")) tags.add("cr7")
  if (text.includes("messi")) tags.add("goat")
  if (text.includes("mbappe")) tags.add("mbappe")
  if (text.includes("vinicius") || text.includes("vini")) tags.add("vini")

  return [...tags]
}

function getKitSearchAliases(kit: EditableKit) {
  const aliases = new Set<string>()
  const club = String(kit.club || "").toLowerCase()
  const text = `${kit.name} ${kit.club} ${kit.season}`.toLowerCase()

  if (club.includes("manchester united")) aliases.add("man u man utd united mufc")
  if (club.includes("paris saint-germain")) aliases.add("psg paris saint germain")
  if (club.includes("barcelona")) aliases.add("barca fcb fc barcelona")
  if (club.includes("real madrid")) aliases.add("real madrid rma los blancos")
  if (club.includes("juventus")) aliases.add("juve juventus")
  if (club.includes("inter miami")) aliases.add("miami inter miami")
  if (club.includes("al nassr")) aliases.add("nassr al nassr")
  if (club.includes("al hilal")) aliases.add("hilal al hilal")
  if (club.includes("tottenham")) aliases.add("spurs tottenham")
  if (club.includes("santos")) aliases.add("santos")
  if (club.includes("brazil")) aliases.add("brasil brazil")
  if (club.includes("netherlands")) aliases.add("holland dutch netherlands")
  if (club.includes("united states") || club === "usa") aliases.add("usa usmnt america")
  if (club.includes("japan")) aliases.add("japan samurai blue")
  if (club.includes("italy")) aliases.add("italy italia azzurri")
  if (text.includes("cristiano ronaldo")) aliases.add("ronaldo cr7 cristiano")
  if (text.includes("lionel messi")) aliases.add("messi leo")
  if (text.includes("neymar")) aliases.add("neymar ney")
  if (text.includes("vinicius") || text.includes("vin")) aliases.add("vini vinicius")
  if (text.includes("mbappe")) aliases.add("mbappe kylian")
  if (text.includes("mystery")) aliases.add("mystery box surprise random")

  return [...aliases]
}

function isNationalTeam(club: string) {
  const countries = [
    "argentina",
    "brazil",
    "england",
    "france",
    "germany",
    "italy",
    "japan",
    "mexico",
    "netherlands",
    "portugal",
    "spain",
    "usa",
    "united states",
  ]

  return countries.some((country) => club.includes(country))
}

function ProductImage({ src, alt }: { src: string; alt: string }) {
  if (src.startsWith("data:")) {
    return <img src={src} alt={alt} className="h-full w-full object-contain p-1" />
  }

  return (
    <Image 
      src={src} 
      alt={alt} 
      fill 
      className="object-contain p-1"
      sizes="112px"
      quality={100}
    />
  )
}

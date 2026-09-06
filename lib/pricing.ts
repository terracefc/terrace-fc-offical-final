import type { Kit } from "@/lib/data"

type PriceableKit = Pick<Kit, "name" | "season" | "league" | "badge" | "price" | "productType"> & { id?: number }

export const EMBROIDERY_ONLY_PRICE = 599

export function isEmbroideryOnlyKit(kit: Pick<Kit, "productType" | "season" | "badge">) {
  const season = String(kit.season || "").toLowerCase()
  return kit.productType === "embroidery" || kit.badge === "Embroidery" || season.includes("embroidery only")
}

export function isRetroJersey(kit: Pick<Kit, "name" | "season" | "badge" | "productType">) {
  if (["f1", "kids", "jacket", "embroidery"].includes(kit.productType || "")) return false
  if (kit.productType === "retro-player") return true

  const text = [kit.name, kit.season, kit.badge].filter(Boolean).join(" ").toLowerCase()
  if (/\bretro\b/.test(text)) return true
  if (String(kit.badge || "").toLowerCase() === "player pick") return true

  const years = String(kit.season || "").match(/\b(?:19|20)\d{2}\b/g)?.map(Number) || []
  return years.length > 0 && Math.max(...years) <= 2022
}

export function isWorldCup2026Kit(kit: Pick<Kit, "season" | "league" | "badge">) {
  const season = String(kit.season || "").toLowerCase()
  const league = String(kit.league || "").toLowerCase()
  const badge = kit.badge?.toLowerCase() || ""

  return season.includes("2026") && (league.includes("international") || badge.includes("2026") || badge.includes("world cup"))
}

export function getKitDisplayBadge(kit: Pick<Kit, "season" | "league" | "badge" | "productType">) {
  const season = String(kit.season || "").toLowerCase()
  const league = String(kit.league || "").toLowerCase()
  const badge = kit.badge?.toLowerCase() || ""
  if (kit.productType === "f1" || league.includes("formula 1")) return "F1"
  if (kit.productType === "jacket") return "Jacket"
  if (kit.badge === "Embroidery" || season.includes("embroidery only")) return "Embroidered"
  if (badge === "mystery") return "Mystery"
  if (season.includes("2026") && (league.includes("international") || badge.includes("world cup"))) return "2026 WC"
  if (season.includes("2022") && (league.includes("international") || badge.includes("world cup") || badge.includes("player pick"))) return "2022 WC"
  if (!league.includes("international")) return isRetroSeason(season) ? "Retro" : "Club"
  if (badge === "player pick") return "Retro"
  return kit.badge || "Jersey"
}

function isRetroSeason(season: string) {
  const years = season.match(/\b(?:19|20)\d{2}\b/g)?.map(Number) || []
  if (years.length === 0) return false
  return Math.max(...years) < 2023
}

export function getKitSalePrice(kit: PriceableKit, testModeEnabled = false) {
  if (testModeEnabled) return 1
  if (kit.productType === "jacket") return kit.price
  if (kit.productType === "f1" || kit.productType === "kids") return kit.price
  if (isRetroJersey(kit)) return 1299
  if (kit.id === 66) return 1299
  if (isEmbroideryOnlyKit(kit)) return EMBROIDERY_ONLY_PRICE
  if (isWorldCup2026Kit(kit)) return 1399
  if (kit.id === 26) return 1499
  if (String(kit.season || "").toLowerCase().includes("long sleeve")) return 1499

  const retroPrices = [1299, 1399, 1499]
  return retroPrices[Math.abs(Number(kit.id || 0)) % retroPrices.length]
}

export function getKitOriginalPrice(kit: PriceableKit, testModeEnabled = false): number | null {
  if (testModeEnabled) return null
  return getKitSalePrice(kit, testModeEnabled) + 100
}

export function withDisplayPrice<T extends PriceableKit>(kit: T, testModeEnabled = false): T {
  return { ...kit, price: getKitSalePrice(kit, testModeEnabled) }
}

import type { Kit } from "@/lib/data"
import { isEmbroideryOnlyKit, isWorldCup2026Kit } from "@/lib/pricing"

type SortableKit = Pick<Kit, "id" | "season" | "league" | "badge" | "productType">

const EMBROIDERY_ID_OFFSET = 10000

export function sortKitsForStorefront<T extends SortableKit>(kits: T[]) {
  return [...kits].sort((left, right) => {
    const leftIsWorldCup = isWorldCup2026Kit(left)
    const rightIsWorldCup = isWorldCup2026Kit(right)
    const leftGroupId = getKitPairId(left)
    const rightGroupId = getKitPairId(right)

    if (leftIsWorldCup || rightIsWorldCup) {
      if (leftIsWorldCup && rightIsWorldCup) return compareWithinPair(left, right, leftGroupId, rightGroupId)
      return leftIsWorldCup ? -1 : 1
    }

    const yearDiff = getSeasonSortYear(right.season) - getSeasonSortYear(left.season)
    if (yearDiff !== 0) return yearDiff
    return compareWithinPair(left, right, leftGroupId, rightGroupId)
  })
}

function compareWithinPair<T extends SortableKit>(left: T, right: T, leftGroupId = getKitPairId(left), rightGroupId = getKitPairId(right)) {
  if (leftGroupId !== rightGroupId) return leftGroupId - rightGroupId
  const leftEmbroidery = isEmbroideryOnlyKit(left)
  const rightEmbroidery = isEmbroideryOnlyKit(right)
  if (leftEmbroidery !== rightEmbroidery) return leftEmbroidery ? 1 : -1
  return left.id - right.id
}

function getKitPairId(kit: Pick<Kit, "id" | "productType" | "season" | "badge">) {
  return isEmbroideryOnlyKit(kit) && kit.id > EMBROIDERY_ID_OFFSET ? kit.id - EMBROIDERY_ID_OFFSET : kit.id
}

function getSeasonSortYear(season: string) {
  const years = season.match(/\b(?:19|20)\d{2}\b/g)?.map(Number) || []
  if (years.length > 0) return Math.max(...years)

  const shortSeason = season.match(/\b(\d{4})-(\d{2})\b/)
  if (shortSeason) {
    const start = Number(shortSeason[1])
    const end = Number(shortSeason[2])
    return Math.floor(start / 100) * 100 + end
  }

  return 0
}

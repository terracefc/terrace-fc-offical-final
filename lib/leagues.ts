import type { Kit } from "@/lib/data"

export type LeagueCard = {
  name: string
  color: string
  count: number
}

const predefinedLeagues = [
  { name: "Premier League", color: "from-purple-600 to-purple-900" },
  { name: "La Liga", color: "from-orange-500 to-red-600" },
  { name: "Serie A", color: "from-blue-600 to-blue-900" },
  { name: "Liga Argentina", color: "from-blue-700 via-sky-500 to-blue-800" },
  { name: "International", color: "from-emerald-600 to-teal-900" },
]

const countryLeagues = new Set(["Brazil"])

export function getDisplayLeague(league: string) {
  return countryLeagues.has(league) ? "International" : league || "Other"
}

export function getLeagueCards(publicKits: Kit[]): LeagueCard[] {
  const leagueCounts: Record<string, number> = {}

  publicKits.forEach((kit) => {
    const leagueName = getDisplayLeague(kit.league)
    leagueCounts[leagueName] = (leagueCounts[leagueName] || 0) + 1
  })

  const updatedPredefined = predefinedLeagues
    .map((league) => ({
      ...league,
      count: leagueCounts[league.name] || 0,
    }))
    .filter((league) => league.count > 0)

  const predefinedNames = new Set(predefinedLeagues.map((league) => league.name))
  const extraGradients = [
    "from-indigo-600 to-violet-900",
    "from-pink-600 to-rose-900",
    "from-cyan-600 to-blue-800",
    "from-red-600 to-black",
  ]
  let gradientIndex = 0

  const extraLeagues = Object.entries(leagueCounts)
    .filter(([name, count]) => !predefinedNames.has(name) && count > 0)
    .map(([name, count]) => {
      const color = extraGradients[gradientIndex % extraGradients.length]
      gradientIndex++
      return { name, count, color }
    })

  return [...updatedPredefined, ...extraLeagues]
}

export function getLeagueSlug(leagueName: string) {
  return leagueName
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function findLeagueBySlug(publicKits: Kit[], slug: string) {
  return getLeagueCards(publicKits).find((league) => getLeagueSlug(league.name) === slug) || null
}

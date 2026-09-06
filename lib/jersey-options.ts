import type { Kit } from "@/lib/data"

export type ClubPatchOption = {
  id: string
  label: string
  description: string
}

/**
 * Club jerseys are deliberately kept separate from retro, national-team,
 * motorsport, kids, and jacket products. Retro stock can therefore be curated
 * later without inheriting the new patch options.
 */
export function isCurrentClubJersey(kit: Pick<Kit, "name" | "season" | "league" | "productType" | "badge">) {
  if ((kit.productType || "jersey") !== "jersey") return false

  const identifyingText = [kit.name, kit.season, kit.badge].filter(Boolean).join(" ")
  if (/\bretro\b/i.test(identifyingText)) return false

  const league = String(kit.league || "").trim().toLowerCase()
  return Boolean(league) && !/(international|world cup|formula|f1|motorsport)/.test(league)
}

export function getClubPatchOptions(kit: Pick<Kit, "name" | "club" | "season" | "league" | "productType" | "badge">): ClubPatchOption[] {
  // Retro jerseys stay untouched, except Manchester United retro jerseys which
  // are deliberately enabled for the same PL/UCL patch choices.
  if (!isCurrentClubJersey(kit) && !isManchesterUnitedRetro(kit)) return []

  const domesticLeague = getDomesticLeague(kit.club, kit.league)
  const domesticOption: ClubPatchOption = {
    id: `league-${slugify(domesticLeague)}`,
    label: domesticLeague,
    description: `Official-style ${domesticLeague} sleeve patch.`,
  }
  const championsLeagueOption: ClubPatchOption = {
    id: "ucl",
    label: "UEFA Champions League",
    description: "Official-style UEFA Champions League sleeve patch.",
  }

  return domesticLeague.toLowerCase().includes("champions league")
    ? [championsLeagueOption]
    : [domesticOption, championsLeagueOption]
}

function isManchesterUnitedRetro(kit: Pick<Kit, "club" | "name" | "season" | "badge">) {
  const club = String(kit.club || "").trim().toLowerCase()
  const identifyingText = [kit.name, kit.season, kit.badge].filter(Boolean).join(" ")
  return club === "manchester united" && /\bretro\b/i.test(identifyingText)
}

function getDomesticLeague(club: string, league: string) {
  const normalizedClub = String(club || "").trim().toLowerCase()
  if (/arsenal|chelsea|liverpool|manchester united|manchester city|tottenham/.test(normalizedClub)) return "Premier League"
  if (/real madrid|barcelona|atletico madrid/.test(normalizedClub)) return "La Liga"
  if (/ac milan|inter milan|juventus|napoli|roma/.test(normalizedClub)) return "Serie A"
  if (/bayern munich|borussia dortmund/.test(normalizedClub)) return "Bundesliga"
  if (/paris saint-germain|psg/.test(normalizedClub)) return "Ligue 1"
  if (/ajax|feyenoord|psv/.test(normalizedClub)) return "Eredivisie"
  if (/benfica|sporting|porto/.test(normalizedClub)) return "Primeira Liga"
  if (/celtic|rangers/.test(normalizedClub)) return "Scottish Premiership"
  return formatLeagueName(league)
}

function formatLeagueName(value: string) {
  const league = String(value || "").trim()
  const aliases: Record<string, string> = {
    "laliga": "La Liga",
    "la liga": "La Liga",
    "premier league": "Premier League",
    "serie a": "Serie A",
    "bundesliga": "Bundesliga",
    "ligue 1": "Ligue 1",
    "eredivisie": "Eredivisie",
    "primeira liga": "Primeira Liga",
    "scottish premiership": "Scottish Premiership",
    "major league soccer": "MLS",
    "mls": "MLS",
  }
  return aliases[league.toLowerCase()] || league
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
}

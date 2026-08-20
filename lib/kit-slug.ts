import type { Kit } from "@/lib/data"

type SlugKit = Pick<Kit, "id" | "club" | "season" | "name">

export function getKitBaseSlug(kit: SlugKit) {
  const season = kit.season
    .replace(/\s*-\s*(short|long)\s+sleeve\s*$/i, "")
    .replace(/\b3rd\s+kit\b/i, "third")
    .replace(/\bhome\s+kit\b/i, "home")
    .replace(/\baway\s+kit\b/i, "away")

  return slugify(`${kit.club} ${season}`)
}

export function getKitSlug(kit: SlugKit, catalog: SlugKit[] = []) {
  const base = getKitBaseSlug(kit)
  const hasCollision = catalog.some((candidate) => candidate.id !== kit.id && getKitBaseSlug(candidate) === base)
  return hasCollision ? `${base}-${slugify(kit.name)}` : base
}

export function getKitPath(kit: SlugKit, catalog: SlugKit[] = []) {
  return `/kit/${getKitSlug(kit, catalog)}`
}

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

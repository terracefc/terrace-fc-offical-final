import { kits } from "@/lib/data"

export type HomepagePhoto = {
  id: string
  src: string
  alt: string
}

export type HomepageHeroSlide = {
  id: string
  kitId: number
  photoId?: string
  src: string
  alt: string
  tag: string
  title: string
  meta: string
}

export type HomepageContent = {
  badge: string
  titleTop: string
  titleAccent: string
  subtitle: string
  primaryCta: string
  secondaryCta: string
  featuredKitId: number
  featuredTag: string
  featuredTitle: string
  featuredMeta: string
  featuredKitIds: number[]
  activePhotoId: string
  photos: HomepagePhoto[]
  heroSlides: HomepageHeroSlide[]
  storyImageKitIds: number[]
  storyBadge: string
  storyTitleTop: string
  storyTitleAccent: string
  storyParagraphOne: string
  storyParagraphTwo: string
}

export const defaultHomepageContent: HomepageContent = {
  badge: "2026 Jersey Drops",
  titleTop: "FOR THE",
  titleAccent: "Culture",
  subtitle: "International 2026 concepts and iconic player jerseys from the biggest names in football.",
  primaryCta: "Shop Collection",
  secondaryCta: "Our Story",
  featuredKitId: 66,
  featuredTag: "Mystery Drop",
  featuredTitle: "Mystery Kit",
  featuredMeta: "₹1,299 - choose your size",
  featuredKitIds: [66, 61, 62, 63, 64, 65, 8, 9],
  activePhotoId: "mystery-kit-2026",
  photos: [
    {
      id: "mystery-kit-2026",
      src: "/kits/processed/july5-drop/mystery-kit-2026.png",
      alt: "Mystery Kit 2026 box",
    },
    {
      id: "japan-home-2026-mitoma",
      src: "/kits/processed/july5-drop/japan-home-2026-mitoma-front.png",
      alt: "Japan 2026 Mitoma jersey",
    },
  ],
  heroSlides: [
    {
      id: "slide-mystery-kit",
      kitId: 66,
      src: "/kits/processed/july5-drop/mystery-kit-2026.png",
      alt: "Mystery Kit 2026 box",
      tag: "Mystery Drop",
      title: "Mystery Kit",
      meta: "₹1,299 - Fan, Player, or Master surprise",
    },
  ],
  storyImageKitIds: [1, 8, 20],
  storyBadge: "Our Story",
  storyTitleTop: "Born in the",
  storyTitleAccent: "Stands",
  storyParagraphOne: "terrace.fc started with a simple idea: football kits are more than just sportswear. They're symbols of identity, carriers of history, and connections to communities across the globe.",
  storyParagraphTwo: "We curate standout jerseys from clubs and countries around the world, focusing on quality, heritage, and the stories behind each design.",
}

export function normalizeHomepageContent(value: unknown): HomepageContent {
  const content = value && typeof value === "object" ? value as Partial<HomepageContent> : {}
  const photos = Array.isArray(content.photos)
    ? content.photos.filter(isHomepagePhoto)
    : defaultHomepageContent.photos
  const activePhotoId = photos.some((photo) => photo.id === content.activePhotoId)
    ? String(content.activePhotoId)
    : photos[0].id || defaultHomepageContent.activePhotoId
  const heroSlides = normalizeHeroSlides(content.heroSlides, {
    featuredKitId: content.featuredKitId,
    featuredTag: content.featuredTag,
    featuredTitle: content.featuredTitle,
    featuredMeta: content.featuredMeta,
    activePhotoId,
    photos,
  })

  return {
    ...defaultHomepageContent,
    ...content,
    featuredKitId: Number.isFinite(Number(content.featuredKitId)) ? Number(content.featuredKitId) : defaultHomepageContent.featuredKitId,
    featuredKitIds: normalizeFeaturedKitIds(content.featuredKitIds),
    photos,
    activePhotoId,
    heroSlides,
    storyImageKitIds: normalizeFeaturedKitIds(content.storyImageKitIds).slice(0, 3),
    storyBadge: typeof content.storyBadge === "string" ? content.storyBadge : defaultHomepageContent.storyBadge,
    storyTitleTop: typeof content.storyTitleTop === "string" ? content.storyTitleTop : defaultHomepageContent.storyTitleTop,
    storyTitleAccent: typeof content.storyTitleAccent === "string" ? content.storyTitleAccent : defaultHomepageContent.storyTitleAccent,
    storyParagraphOne: typeof content.storyParagraphOne === "string" ? content.storyParagraphOne : defaultHomepageContent.storyParagraphOne,
    storyParagraphTwo: typeof content.storyParagraphTwo === "string" ? content.storyParagraphTwo : defaultHomepageContent.storyParagraphTwo,
  }
}

function normalizeFeaturedKitIds(value: unknown) {
  if (!Array.isArray(value)) return defaultHomepageContent.featuredKitIds

  return [...new Set(value.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))].slice(0, 8)
}

function isHomepagePhoto(value: unknown): value is HomepagePhoto {
  if (!value || typeof value !== "object") return false
  const photo = value as Partial<HomepagePhoto>
  return typeof photo.id === "string" && typeof photo.src === "string" && typeof photo.alt === "string"
}

function normalizeHeroSlides(
  value: unknown,
  fallback: {
    featuredKitId: unknown
    featuredTag: unknown
    featuredTitle: unknown
    featuredMeta: unknown
    activePhotoId: string
    photos: HomepagePhoto[]
  },
) {
  const slides = Array.isArray(value) ? value.filter(isHomepageHeroSlide) : []
  if (Array.isArray(value) && slides.length === 0) return []

  if (slides.length > 0) {
    return slides.slice(0, 12).map((slide) => {
      return {
        ...slide,
        photoId: undefined,
      }
    })
  }

  const fallbackPhoto = fallback.photos.find((photo) => photo.id === fallback.activePhotoId) || fallback.photos[0] || defaultHomepageContent.photos[0]
  const fallbackKitId = Number.isFinite(Number(fallback.featuredKitId)) ? Number(fallback.featuredKitId) : defaultHomepageContent.featuredKitId
  const fallbackKit = kits.find((kit) => kit.id === fallbackKitId)

  return [{
    id: "slide-legacy-featured",
    kitId: fallbackKitId,
    src: fallbackKit.image || fallbackPhoto.src,
    alt: fallbackKit.name || fallbackPhoto.alt,
    tag: typeof fallback.featuredTag === "string" ? fallback.featuredTag : defaultHomepageContent.featuredTag,
    title: typeof fallback.featuredTitle === "string" ? fallback.featuredTitle : defaultHomepageContent.featuredTitle,
    meta: typeof fallback.featuredMeta === "string" ? fallback.featuredMeta : defaultHomepageContent.featuredMeta,
  }]
}

function isHomepageHeroSlide(value: unknown): value is HomepageHeroSlide {
  if (!value || typeof value !== "object") return false
  const slide = value as Partial<HomepageHeroSlide>
  return (
    typeof slide.id === "string" &&
    Number.isFinite(Number(slide.kitId)) &&
    typeof slide.src === "string" &&
    typeof slide.alt === "string" &&
    typeof slide.tag === "string" &&
    typeof slide.title === "string" &&
    typeof slide.meta === "string"
  )
}

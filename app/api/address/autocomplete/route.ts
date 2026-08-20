import { NextResponse } from "next/server"

type MapplsLocation = {
  placeName?: string
  placeAddress?: string
  addressTokens?: {
    houseNumber?: string
    houseName?: string
    poi?: string
    street?: string
    subSubLocality?: string
    subLocality?: string
    locality?: string
    village?: string
    subDistrict?: string
    district?: string
    city?: string
    state?: string
    pincode?: string
  }
}

type AddressSuggestion = {
  properties: {
    formatted: string
    address_line1: string
    address_line2: string
    city: string
    county: string
    state: string
    postcode: string
    place_id?: string
    latitude?: number
    longitude?: number
  }
}

type LocationBias = {
  lat: number
  lon: number
}

const recentSearchCache = new Map<string, { suggestions: AddressSuggestion[]; expiresAt: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000
const CACHE_VERSION = "v5"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const query = String(url.searchParams.get("q") || "").trim()
  const locationBias = readLocationBias(url)

  if (query.length < 3) {
    return NextResponse.json({ suggestions: [] })
  }

  const cacheKey = getCacheKey(query, locationBias)
  const cached = recentSearchCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    const response = NextResponse.json({ suggestions: cached.suggestions })
    response.headers.set("x-address-provider", "cache")
    return response
  }

  const queryVariants = buildQueryVariants(query)
  const [googleSuggestions, googleTextSuggestions, mapplsSuggestions, geoapifySuggestions] = await Promise.all([
    googlePlacesAutocomplete(queryVariants, request, locationBias),
    googleTextSearch(queryVariants, request, locationBias),
    mapplsAutocomplete(queryVariants),
    geoapifyFallback(queryVariants, locationBias),
  ])

  const suggestions = filterWeakMatches(rankSuggestions(dedupeSuggestions([
    ...googleSuggestions,
    ...googleTextSuggestions,
    ...geoapifySuggestions,
    ...mapplsSuggestions,
  ]), query), query)
    .slice(0, 8)

  recentSearchCache.set(cacheKey, {
    suggestions,
    expiresAt: Date.now() + CACHE_TTL_MS,
  })

  const response = NextResponse.json({ suggestions })
  response.headers.set("x-address-provider", "combined")
  return response
}

async function mapplsAutocomplete(queryVariants: string[]): Promise<AddressSuggestion[]> {
  const key = process.env.MAPPLS_STATIC_KEY || process.env.NEXT_PUBLIC_MAPPLS_STATIC_KEY || ""
  if (!key) return []

  const searchUrl = new URL("https://search.mappls.com/search/places/autosuggest/json")
  searchUrl.searchParams.set("query", queryVariants[0].slice(0, 45))
  searchUrl.searchParams.set("region", "IND")
  searchUrl.searchParams.set("tokenizeAddress", "")
  searchUrl.searchParams.set("access_token", key)

  const response = await fetch(searchUrl.toString(), { cache: "no-store" })
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    console.warn("Mappls autocomplete failed", data?.error || data?.message || response.status)
    return []
  }

  const locations = [
    ...(Array.isArray(data?.suggestedLocations) ? data.suggestedLocations : []),
    ...(Array.isArray(data?.userAddedLocations) ? data.userAddedLocations : []),
  ] as MapplsLocation[]

  return locations.map((location) => {
    const tokens = location.addressTokens || {}
    const addressLine1 = [tokens.houseNumber, tokens.houseName, tokens.poi || location.placeName, tokens.street]
      .filter(Boolean)
      .join(", ")
    const addressLine2 = [
      tokens.subSubLocality,
      tokens.subLocality,
      tokens.locality,
      tokens.village,
      tokens.subDistrict,
      tokens.district,
    ].filter(Boolean).join(", ")

    return {
      properties: {
        formatted: [location.placeName, location.placeAddress].filter(Boolean).join(", "),
        address_line1: addressLine1 || location.placeName || location.placeAddress || "",
        address_line2: addressLine2 || location.placeAddress || "",
        city: tokens.city || tokens.district || "",
        county: tokens.district || "",
        state: tokens.state || "",
        postcode: tokens.pincode || extractPincode(location.placeAddress || ""),
        place_id: "",
      },
    }
  })
}

function extractPincode(value: string) {
  return value.match(/\b\d{6}\b/)?.[0] || ""
}

async function googlePlacesAutocomplete(queries: string[], request: Request, locationBias: LocationBias | null): Promise<AddressSuggestion[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY || ""
  if (!key) return []

  const requestUrl = new URL(request.url)
  const referer = request.headers.get("referer") || `${requestUrl.origin}/`
  const collected: any[] = []

  for (const query of queries.slice(0, 3)) {
    const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "Referer": referer,
      },
      body: JSON.stringify({
        input: query,
        includedRegionCodes: ["in"],
        languageCode: "en",
        ...(locationBias ? {
          locationBias: {
            circle: {
              center: {
                latitude: locationBias.lat,
                longitude: locationBias.lon,
              },
              radius: 3000,
            },
          },
        } : {}),
      }),
      cache: "no-store",
    })
    const data = await response.json().catch(() => null)

    if (!response.ok) {
      const message = data?.error?.message || data?.error || String(response.status)
      console.warn("Google Places autocomplete failed", message)
      return []
    }

    if (Array.isArray(data?.suggestions)) {
      collected.push(...data.suggestions)
    }

    if (collected.length >= 6) break
  }

  return collected.map((suggestion: any) => {
    const prediction = suggestion.placePrediction || {}
    const text = prediction.text?.text || ""
    const parts = text.split(",").map((part: string) => part.trim()).filter(Boolean)

    return {
      properties: {
        formatted: text,
        address_line1: parts[0] || text,
        address_line2: parts.slice(1).join(", "),
        city: "",
        county: "",
        state: "",
        postcode: "",
        place_id: prediction.placeId || "",
      },
    }
  })
}

async function googleTextSearch(queries: string[], request: Request, locationBias: LocationBias | null): Promise<AddressSuggestion[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY || ""
  if (!key) return []

  const requestUrl = new URL(request.url)
  const referer = request.headers.get("referer") || `${requestUrl.origin}/`
  const collected: any[] = []

  for (const query of queries.slice(0, 2)) {
    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.addressComponents",
        "Referer": referer,
      },
      body: JSON.stringify({
        textQuery: `${query}, India`,
        languageCode: "en",
        regionCode: "IN",
        pageSize: 5,
        ...(locationBias ? {
          locationBias: {
            circle: {
              center: {
                latitude: locationBias.lat,
                longitude: locationBias.lon,
              },
              radius: 3000,
            },
          },
        } : {}),
      }),
      cache: "no-store",
    })
    const data = await response.json().catch(() => null)

    if (!response.ok) {
      const message = data?.error?.message || data?.error || String(response.status)
      console.warn("Google text search failed", message)
      return []
    }

    if (Array.isArray(data?.places)) {
      collected.push(...data.places)
    }

    if (collected.length >= 6) break
  }

  return collected.map((place: any) => {
    const components = Array.isArray(place.addressComponents) ? place.addressComponents : []
    const component = (type: string) => components.find((item: any) => Array.isArray(item.types) && item.types.includes(type))?.longText || ""
    const name = place.displayName?.text || ""
    const formatted = place.formattedAddress || name
    const route = component("route")
    const sublocality = component("sublocality_level_1") || component("sublocality")
    const locality = component("locality") || component("administrative_area_level_3")
    const state = component("administrative_area_level_1")
    const postcode = component("postal_code")
    const streetNumber = component("street_number")
    const addressLine1 = [name, streetNumber, route].filter(Boolean).join(", ") || formatted
    const addressLine2 = [sublocality, locality, state, postcode].filter(Boolean).join(", ")

    return {
      properties: {
        formatted,
        address_line1: addressLine1,
        address_line2: addressLine2,
        city: locality,
        county: component("administrative_area_level_3"),
        state,
        postcode,
        place_id: place.id || "",
        latitude: Number(place.location?.latitude) || undefined,
        longitude: Number(place.location?.longitude) || undefined,
      },
    }
  })
}

async function geoapifyFallback(queries: string[], locationBias: LocationBias | null): Promise<AddressSuggestion[]> {
  const key = process.env.GEOAPIFY_API_KEY || process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY || ""
  if (!key) return []

  const features: any[] = []

  for (const query of queries.slice(0, 3)) {
    const url = new URL("https://api.geoapify.com/v1/geocode/autocomplete")
    url.searchParams.set("text", query)
    url.searchParams.set("filter", "countrycode:in")
    url.searchParams.set("lang", "en")
    url.searchParams.set("limit", "6")
    url.searchParams.set("apiKey", key)
    if (locationBias) {
      url.searchParams.set("bias", `proximity:${locationBias.lon},${locationBias.lat}`)
    }

    const response = await fetch(url.toString(), { cache: "no-store" })
    const data = await response.json().catch(() => null)
    if (Array.isArray(data?.features)) features.push(...data.features)
    if (features.length >= 6) break
  }

  return features.map((feature: any) => ({
      properties: {
        formatted: feature.properties?.formatted || "",
        address_line1: feature.properties?.address_line1 || feature.properties?.formatted || "",
        address_line2: feature.properties?.address_line2 || "",
        city: feature.properties?.city || feature.properties?.county || "",
        county: feature.properties?.county || "",
        state: feature.properties?.state || "",
        postcode: feature.properties?.postcode || "",
        place_id: feature.properties?.place_id || "",
        latitude: Number(feature.properties?.lat) || undefined,
        longitude: Number(feature.properties?.lon) || undefined,
      },
    }))
}

function buildQueryVariants(query: string) {
  const cleaned = query
    .replace(/[^\w\s,.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  const withoutNoise = cleaned
    .replace(/\b(near|beside|opposite|behind|road|rd|street|st|main|cross)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()

  const words = cleaned.split(/[\s,]+/).filter(Boolean)
  const trimmedLongWords = words
    .map((word) => word.length > 6 ? word.slice(0, -1) : word)
    .join(" ")

  return Array.from(new Set([cleaned, withoutNoise, trimmedLongWords].filter((item) => item.length >= 3)))
}

function readLocationBias(url: URL): LocationBias | null {
  const lat = Number(url.searchParams.get("lat"))
  const lon = Number(url.searchParams.get("lon"))

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  return { lat, lon }
}

function getCacheKey(query: string, locationBias: LocationBias | null) {
  const base = normalizeAddressKey(query)
  if (!locationBias) return `${CACHE_VERSION}|${base}`
  return `${CACHE_VERSION}|${base}|${locationBias.lat.toFixed(2)},${locationBias.lon.toFixed(2)}`
}

function dedupeSuggestions<T extends { properties?: { formatted?: string; address_line1?: string; address_line2?: string; city?: string; county?: string; state?: string; postcode?: string; place_id?: string } }>(suggestions: T[]) {
  const seen = new Set<string>()
  const seenPlaceNames = new Set<string>()

  return suggestions.filter((suggestion) => {
    const properties = suggestion.properties || {}
    const fullKey = normalizeAddressKey(properties.formatted || `${properties.address_line1 || ""} ${properties.address_line2 || ""}`)
    const placeKey = normalizePlaceNameKey(properties.address_line1 || properties.formatted || "")
    const localityKey = normalizeAddressKey(`${properties.city || ""} ${properties.county || ""} ${properties.state || ""}`)
      .split(/\s+/)
      .slice(0, 4)
      .join(" ")
    const key = fullKey
    const placeNameKey = [placeKey, localityKey].filter(Boolean).join("|")

    if (!key.trim() || seen.has(key) || (placeKey && seenPlaceNames.has(placeNameKey))) return false
    seen.add(key)
    if (placeKey) seenPlaceNames.add(placeNameKey)
    return true
  })
}

function rankSuggestions(suggestions: AddressSuggestion[], query: string) {
  return suggestions.sort((left, right) => scoreSuggestion(right, query) - scoreSuggestion(left, query))
}

function filterWeakMatches(suggestions: AddressSuggestion[], query: string) {
  const queryWords = normalizeAddressKey(query).split(/\s+/).filter(Boolean)
  const firstWord = queryWords[0] || ""
  if (firstWord.length < 4) return suggestions

  const strongMatches = suggestions.filter((suggestion) => {
    const text = normalizeAddressKey(`${suggestion.properties.address_line1 || ""} ${suggestion.properties.formatted || ""}`)
    return text.split(/\s+/).some((word) => wordsAreClose(word, firstWord, 1))
  })

  return strongMatches.length > 0 ? strongMatches : suggestions
}

function normalizeAddressKey(value: string) {
  return value
    .toLowerCase()
    .replace(/\b(india|bharat)\b/g, "")
    .replace(/\bphase\b/g, "ph")
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "")
    .trim()
}

function normalizePlaceNameKey(value: string) {
  return normalizeAddressKey(value)
    .replace(/\b(apartment|apartments|apt|flat|tower|block|phase|road|rd|street|st|main|cross|near|the|and|residency|residence|homes|heights|county|city|village|pvt|ltd|private|limited)\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function scoreSuggestion(suggestion: AddressSuggestion, query: string) {
  const formatted = normalizeAddressKey(suggestion.properties.formatted || "")
  const line1 = normalizeAddressKey(suggestion.properties.address_line1 || "")
  const queryKey = normalizeAddressKey(query)
  const queryWords = queryKey.split(/\s+/).filter(Boolean)
  const lastWord = queryWords.at(-1) || ""
  const firstWord = queryWords[0] || ""
  const textWords = `${line1} ${formatted}`.split(/\s+/).filter(Boolean)
  let score = 0

  if (firstWord && textWords.some((word) => word === firstWord || word.startsWith(firstWord))) score += 520
  if (formatted === queryKey || line1 === queryKey) score += 1000
  if (formatted.startsWith(queryKey) || line1.startsWith(queryKey)) score += 650
  if (queryWords.every((word) => formatted.includes(word))) score += 350
  if (queryWords.every((word) => line1.includes(word))) score += 300
  score += queryWords.reduce((sum, word) => {
    const generic = isGenericAddressWord(word)
    const best = textWords.some((textWord) => wordsAreClose(textWord, word, generic ? 1 : 2))
    if (best) return sum + (generic ? 30 : 230)
    return sum - (generic ? 20 : 180)
  }, 0)
  if (lastWord.length >= 2 && !isGenericAddressWord(lastWord) && line1.split(/\s+/).some((word) => word.startsWith(lastWord))) score += 220
  if (lastWord.length >= 2 && !isGenericAddressWord(lastWord) && formatted.split(/\s+/).some((word) => word.startsWith(lastWord))) score += 180
  if (suggestion.properties.postcode) score += 40
  if (suggestion.properties.latitude && suggestion.properties.longitude) score += 20

  const firstQueryWord = queryWords[0] || ""
  if (firstQueryWord && !formatted.includes(firstQueryWord) && !line1.includes(firstQueryWord)) score -= 500

  return score
}

function wordsAreClose(candidate: string, target: string, maxDistance?: number) {
  if (!candidate || !target) return false
  if (candidate === target || candidate.startsWith(target) || target.startsWith(candidate)) return true
  if (target.length < 4 || candidate.length < 4) return false
  return levenshteinDistance(candidate, target) <= (maxDistance ?? (target.length <= 6 ? 1 : 2))
}

function isGenericAddressWord(word: string) {
  return /^(apartment|apartments|apt|flat|tower|block|phase|road|rd|street|st|main|cross|near|the|and|residency|residence|homes|heights|county|city|village)$/i.test(word)
}

function levenshteinDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    let last = leftIndex
    previous[0] = leftIndex + 1

    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const old = previous[rightIndex + 1]
      previous[rightIndex + 1] = Math.min(
        previous[rightIndex + 1] + 1,
        previous[rightIndex] + 1,
        last + (left[leftIndex] === right[rightIndex] ? 0 : 1),
      )
      last = old
    }
  }

  return previous[right.length]
}

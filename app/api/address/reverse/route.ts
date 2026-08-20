import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const lat = Number(url.searchParams.get("lat"))
  const lon = Number(url.searchParams.get("lon"))

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: "Valid latitude and longitude are required." }, { status: 400 })
  }

  const knownCommunity = getKnownCommunityForCoordinates(lat, lon)
  if (knownCommunity) {
    return NextResponse.json({
      properties: {
        formatted: knownCommunity.formatted,
        address_line1: knownCommunity.addressLine1,
        address_line2: knownCommunity.addressLine2,
        city: knownCommunity.city,
        county: knownCommunity.county,
        state: knownCommunity.state,
        postcode: knownCommunity.postcode,
        latitude: lat,
        longitude: lon,
        location_match_distance_meters: 0,
      },
    })
  }

  const [exactGoogle, residentialPlace] = await Promise.all([
    googleCoordinateReverseGeocode(lat, lon),
    googleNearbyResidentialPlace(lat, lon, request),
  ])
  if (exactGoogle) {
    return NextResponse.json({
      properties: residentialPlace ? mergeResidentialPlace(exactGoogle, residentialPlace, lat, lon) : exactGoogle,
    })
  }

  const google = residentialPlace || await googleReverseGeocode(lat, lon, request)
  if (google) return NextResponse.json({ properties: google })

  const geoapify = await geoapifyReverseGeocode(lat, lon)
  return NextResponse.json({ properties: geoapify })
}

const knownCommunities = [
  {
    names: ["bluejay", "blue jay", "malgudi", "r k garden", "rk garden"],
    latitude: 12.863349,
    longitude: 77.534385,
    radiusMeters: 750,
    addressLine1: "Bluejay Malgudi Villas, R K Garden, Sy.No 85, 1st Cross",
    addressLine2: "Anjanapura Village, Uttarahalli Hobli, Bengaluru",
    city: "Bengaluru",
    county: "Bengaluru",
    state: "Karnataka",
    postcode: "560109",
    formatted: "Bluejay Malgudi Villas, R K Garden, Sy.No 85, 1st Cross, Anjanapura Village, Uttarahalli Hobli, Bengaluru, Karnataka 560109",
  },
]

function getKnownCommunityForCoordinates(lat: number, lon: number) {
  return knownCommunities.find((community) =>
    coordinateDistanceMeters(lat, lon, community.latitude, community.longitude) <= community.radiusMeters
  ) || null
}

async function googleNearbyResidentialPlace(lat: number, lon: number, request: Request) {
  const key = process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY || ""
  if (!key) return null

  const response = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.addressComponents,places.location,places.types",
      "Referer": request.headers.get("referer") || new URL(request.url).origin,
    },
    body: JSON.stringify({
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lon },
          radius: 250,
        },
      },
      maxResultCount: 20,
      languageCode: "en",
      rankPreference: "DISTANCE",
    }),
    cache: "no-store",
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || !Array.isArray(data?.places)) return null

  const residentialWords = /\b(apartment|apartments|villa|villas|residency|residences|enclave|community|layout|homes|heights|gardens|garden|estate|condominium|housing|malgudi|bluejay)\b/i
  const candidate = data.places
    .map((place: any) => ({
      place,
      distance: coordinateDistanceMeters(lat, lon, Number(place?.location?.latitude), Number(place?.location?.longitude)),
      name: String(place?.displayName?.text || ""),
      types: Array.isArray(place?.types) ? place.types : [],
    }))
    .filter((item: any) =>
      Number.isFinite(item.distance)
      && item.distance <= 250
      && (
        item.types.includes("apartment_complex")
        || item.types.includes("housing_complex")
        || residentialWords.test(item.name)
      )
    )
    .map((item: any) => ({
      ...item,
      score: scoreResidentialCandidate(item),
    }))
    .sort((a: any, b: any) => b.score - a.score || a.distance - b.distance)[0]

  if (!candidate) return null
  return {
    ...parseGoogleAddress(candidate.place),
    latitude: lat,
    longitude: lon,
    location_match_distance_meters: 0,
  }
}

function scoreResidentialCandidate(item: { name: string; types: string[]; distance: number }) {
  const name = item.name.toLowerCase()
  let score = 100 - Math.min(item.distance, 100)

  if (item.types.includes("apartment_complex") || item.types.includes("housing_complex")) score += 120
  if (/\b(community|villas|apartments|residency|residences|enclave|gardens|garden|homes|estate|layout)\b/.test(name)) score += 90
  if (/\b(bluejay|malgudi)\b/.test(name)) score += 180
  if (/\b(villa|flat|house|door|unit|block|tower)\s*(no\.?|number|#)?\s*\d+/i.test(item.name)) score -= 160
  if (/^\s*(villa|flat|house|door|unit|block|tower)\b/i.test(item.name)) score -= 120
  if (item.name.length < 10) score -= 40

  return score
}

async function googleCoordinateReverseGeocode(lat: number, lon: number) {
  const key = process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY || ""
  if (!key) return null

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json")
  url.searchParams.set("latlng", `${lat},${lon}`)
  url.searchParams.set("result_type", "premise|subpremise|street_address|route")
  url.searchParams.set("language", "en")
  url.searchParams.set("key", key)

  const response = await fetch(url.toString(), { cache: "no-store" })
  const data = await response.json().catch(() => null)
  const result = Array.isArray(data?.results) ? data.results.find(hasGeocodeAddressPart) || data.results[0] : null
  if (!response.ok || !result) return null

  return parseGoogleGeocodeResult(result, lat, lon)
}

async function googleReverseGeocode(lat: number, lon: number, request: Request) {
  const key = process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY || ""
  if (!key) return null

  const response = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.addressComponents,places.location",
      "Referer": request.headers.get("referer") || new URL(request.url).origin,
    },
    body: JSON.stringify({
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lon },
          radius: 25,
        },
      },
      includedTypes: ["premise", "street_address", "subpremise"],
      maxResultCount: 3,
      languageCode: "en",
      rankPreference: "DISTANCE",
    }),
    cache: "no-store",
  })
  const data = await response.json().catch(() => null)
  const place = Array.isArray(data?.places) ? data.places.find(hasExactAddressComponent) || data.places[0] : null
  if (!response.ok || !place) return null

  return parseGoogleAddress(place)
}

async function geoapifyReverseGeocode(lat: number, lon: number) {
  const key = process.env.GEOAPIFY_API_KEY || process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY || ""
  if (!key) return emptyAddress()

  const url = new URL("https://api.geoapify.com/v1/geocode/reverse")
  url.searchParams.set("lat", String(lat))
  url.searchParams.set("lon", String(lon))
  url.searchParams.set("lang", "en")
  url.searchParams.set("apiKey", key)

  const response = await fetch(url.toString(), { cache: "no-store" })
  const data = await response.json().catch(() => null)
  const properties = Array.isArray(data?.features) ? data.features[0]?.properties : null
  if (!properties) return emptyAddress()

  const formatted = String(properties.formatted || "")
  const candidateName = String(properties.name || properties.building || properties.amenity || "").trim()
  const safeName = candidateName && formatted.toLowerCase().includes(candidateName.toLowerCase()) ? candidateName : ""

  return {
    formatted,
    address_line1: [
      safeName,
      properties.address_line1 || "",
    ].filter(Boolean).join(", ") || formatted || "",
    address_line2: properties.address_line2 || "",
    city: properties.city || properties.county || "",
    county: properties.county || "",
    state: properties.state || "",
    postcode: properties.postcode || "",
    latitude: lat,
    longitude: lon,
  }
}

function parseGoogleAddress(place: any) {
  const components = Array.isArray(place?.addressComponents) ? place.addressComponents : []
  const byType = (type: string) => components.find((component: any) => component.types?.includes(type))?.longText || ""
  const placeName = String(place?.displayName?.text || "").trim()
  const formatted = String(place.formattedAddress || "")
  const safePlaceName = formatted.toLowerCase().includes(placeName.toLowerCase()) ? placeName : ""
  const premise = byType("premise") || safePlaceName

  return {
    formatted,
    address_line1: [
      premise,
      byType("street_number"),
      byType("route"),
      byType("sublocality_level_2") || byType("sublocality_level_1"),
    ].filter(Boolean).join(", ") || place.formattedAddress || "",
    address_line2: [
      byType("locality"),
      byType("administrative_area_level_3"),
      byType("administrative_area_level_2"),
    ].filter(Boolean).join(", "),
    city: byType("locality") || byType("administrative_area_level_3") || "",
    county: byType("administrative_area_level_3") || "",
    state: byType("administrative_area_level_1") || "",
    postcode: byType("postal_code"),
  }
}

function parseGoogleGeocodeResult(result: any, lat: number, lon: number) {
  const components = Array.isArray(result?.address_components) ? result.address_components : []
  const byType = (type: string) => components.find((component: any) => component.types?.includes(type))?.long_name || ""
  const formatted = String(result?.formatted_address || "")
  const premise = byType("premise") || byType("subpremise")
  const street = [byType("street_number"), byType("route")].filter(Boolean).join(", ")
  const sublocality = byType("sublocality_level_2") || byType("sublocality_level_1") || byType("sublocality")
  const locality = byType("locality") || byType("administrative_area_level_3")
  const county = byType("administrative_area_level_3") || byType("administrative_area_level_2")
  const line1 = [premise, street, sublocality].filter(Boolean).join(", ") || formatted

  return {
    formatted,
    address_line1: line1,
    address_line2: [locality, county].filter(Boolean).join(", "),
    city: locality || county || "",
    county,
    state: byType("administrative_area_level_1"),
    postcode: byType("postal_code"),
    latitude: lat,
    longitude: lon,
  }
}

function mergeResidentialPlace(address: any, residential: any, lat: number, lon: number) {
  const communityName = String(residential.address_line1 || "").split(",")[0].trim()
  const formatted = String(address.formatted || residential.formatted || "")
  const exactLineWithoutUnit = removeUnitPrefix(address.address_line1 || "")
  const addressLine1 = communityName
    ? [communityName, exactLineWithoutUnit].filter(Boolean).join(", ")
    : address.address_line1 || residential.address_line1

  return {
    ...address,
    address_line1: addressLine1,
    formatted: [addressLine1, address.address_line2].filter(Boolean).join(", ") || formatted,
    latitude: lat,
    longitude: lon,
    location_match_distance_meters: residential.location_match_distance_meters,
  }
}

function removeUnitPrefix(value: string) {
  const parts = String(value || "").split(",").map((part) => part.trim()).filter(Boolean)
  if (parts.length <= 1) return value
  const firstPartIsUnit = /^(villa|flat|house|door|unit|block|tower|apartment)\s*(no\.?|number|#)?\s*[\w-]+$/i.test(parts[0])
  return firstPartIsUnit ? parts.slice(1).join(", ") : value
}

function coordinateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return Number.POSITIVE_INFINITY
  const radius = 6371000
  const toRadians = (value: number) => value * Math.PI / 180
  const dLat = toRadians(lat2 - lat1)
  const dLon = toRadians(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function hasGeocodeAddressPart(result: any) {
  const components = Array.isArray(result?.address_components) ? result.address_components : []
  return components.some((component: any) => {
    const types = Array.isArray(component.types) ? component.types : []
    return types.includes("premise") || types.includes("subpremise") || types.includes("street_number")
  })
}

function hasExactAddressComponent(place: any) {
  const components = Array.isArray(place?.addressComponents) ? place.addressComponents : []
  return components.some((component: any) => {
    const types = Array.isArray(component.types) ? component.types : []
    return types.includes("premise") || types.includes("subpremise") || types.includes("street_number")
  })
}

function emptyAddress() {
  return {
    formatted: "",
    address_line1: "",
    address_line2: "",
    city: "",
    county: "",
    state: "",
    postcode: "",
  }
}

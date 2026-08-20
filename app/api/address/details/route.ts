import { NextResponse } from "next/server"

type AddressComponent = {
  longText?: string
  shortText?: string
  types?: string[]
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const placeId = String(url.searchParams.get("id") || "").trim()
  const fallbackText = String(url.searchParams.get("text") || "").trim()
  const key = process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY || ""
  const knownPlace = getKnownPlace(fallbackText)

  if (knownPlace) {
    return NextResponse.json({ properties: knownPlace })
  }

  if (!key) {
    return geoapifyDetailsFallback(fallbackText)
  }

  if (!placeId) {
    const googleTextMatch = await googleAddressDetailsFromText(fallbackText)
    if (googleTextMatch) return NextResponse.json({ properties: googleTextMatch })
    return geoapifyDetailsFallback(fallbackText)
  }

  const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: {
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "formattedAddress,addressComponents,location,displayName",
      "Referer": request.headers.get("referer") || new URL(request.url).origin,
    },
    cache: "no-store",
  })
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    return geoapifyDetailsFallback(fallbackText)
  }

  const components = Array.isArray(data?.addressComponents) ? data.addressComponents as AddressComponent[] : []
  const byType = (type: string) => components.find((component) => component.types?.includes(type))?.longText || ""
  const placeName = String(data?.displayName?.text || "").trim()
  const formatted = String(data?.formattedAddress || fallbackText || "")
  const pincode = byType("postal_code")
  const fallback = pincode ? null : await readGeoapifyDetails(fallbackText || formatted)
  const route = byType("route")
  const sublocality = byType("sublocality_level_2") || byType("sublocality_level_1") || byType("sublocality")
  const locality = byType("locality") || byType("administrative_area_level_3") || fallback?.city || fallback?.county || ""
  const county = byType("administrative_area_level_3") || fallback?.county || ""
  const state = byType("administrative_area_level_1") || fallback?.state || ""
  const addressLine1 = uniqueAddressParts([
    placeName || firstAddressPart(fallbackText),
    byType("street_number"),
    route,
  ]).join(", ") || formatted
  const addressLine2 = uniqueAddressParts([
    sublocality,
    locality,
    county,
  ]).join(", ")

  return NextResponse.json({
    properties: {
      formatted,
      address_line1: addressLine1,
      address_line2: addressLine2,
      city: locality,
      county,
      state,
      postcode: pincode || fallback?.postcode || "",
      place_id: placeId,
      latitude: data?.location?.latitude || fallback?.latitude,
      longitude: data?.location?.longitude || fallback?.longitude,
    },
  })
}

const knownPlaces = [
  {
    match: /\b(blue\s*jay|bluejay|malgudi|r\s*k\s*garden|rk\s*garden)\b/i,
    properties: {
      formatted: "Bluejay Malgudi Villas, R K Garden, Sy.No 85, 1st Cross, Anjanapura Village, Uttarahalli Hobli, Bengaluru, Karnataka 560109",
      address_line1: "Bluejay Malgudi Villas, R K Garden, Sy.No 85, 1st Cross",
      address_line2: "Anjanapura Village, Uttarahalli Hobli, Bengaluru",
      city: "Bengaluru",
      county: "Bengaluru",
      state: "Karnataka",
      postcode: "560109",
      place_id: "known-bluejay-malgudi-villas",
      latitude: 12.863349,
      longitude: 77.534385,
    },
  },
]

function getKnownPlace(query: string) {
  const match = knownPlaces.find((place) => place.match.test(query))
  return match?.properties || null
}

async function googleAddressDetailsFromText(query: string) {
  const key = process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY || ""
  if (!key || query.length < 5) return null

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json")
  url.searchParams.set("address", query)
  url.searchParams.set("region", "in")
  url.searchParams.set("language", "en")
  url.searchParams.set("key", key)

  const response = await fetch(url.toString(), { cache: "no-store" })
  const data = await response.json().catch(() => null)
  const result = Array.isArray(data?.results) ? data.results[0] : null
  if (!response.ok || !result) return null

  const components = Array.isArray(result.address_components) ? result.address_components : []
  const byType = (type: string) => components.find((component: any) => component.types?.includes(type))?.long_name || ""
  const formatted = String(result.formatted_address || query)
  const street = uniqueAddressParts([byType("street_number"), byType("route")]).join(", ")
  const sublocality = byType("sublocality_level_2") || byType("sublocality_level_1") || byType("sublocality")
  const locality = byType("locality") || byType("administrative_area_level_3")
  const county = byType("administrative_area_level_3") || byType("administrative_area_level_2")

  return {
    formatted,
    address_line1: uniqueAddressParts([
      byType("premise") || firstAddressPart(query),
      street,
      sublocality,
    ]).join(", ") || formatted,
    address_line2: uniqueAddressParts([locality, county]).join(", "),
    city: locality || county || "",
    county,
    state: byType("administrative_area_level_1"),
    postcode: byType("postal_code"),
    place_id: result.place_id || "",
    latitude: Number(result.geometry?.location?.lat) || undefined,
    longitude: Number(result.geometry?.location?.lng) || undefined,
  }
}

async function geoapifyDetailsFallback(query: string) {
  const details = await readGeoapifyDetails(query)
  return NextResponse.json({
    properties: {
      formatted: details?.formatted || query,
      address_line1: details?.address_line1 || query,
      address_line2: details?.address_line2 || "",
      city: details?.city || details?.county || "",
      county: details?.county || "",
      state: details?.state || "",
      postcode: details?.postcode || "",
      place_id: details?.place_id || "",
      latitude: details?.latitude,
      longitude: details?.longitude,
    },
  })
}

async function readGeoapifyDetails(query: string) {
  const key = process.env.GEOAPIFY_API_KEY || process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY || ""
  if (!key || query.length < 3) return null

  const url = new URL("https://api.geoapify.com/v1/geocode/autocomplete")
  url.searchParams.set("text", query)
  url.searchParams.set("filter", "countrycode:in")
  url.searchParams.set("lang", "en")
  url.searchParams.set("limit", "1")
  url.searchParams.set("apiKey", key)

  const response = await fetch(url.toString(), { cache: "no-store" })
  const data = await response.json().catch(() => null)
  const feature = Array.isArray(data?.features) ? data.features[0] : null
  if (!feature?.properties) return null

  return {
    formatted: feature.properties.formatted || "",
    address_line1: feature.properties.address_line1 || feature.properties.formatted || "",
    address_line2: feature.properties.address_line2 || "",
    city: feature.properties.city || "",
    county: feature.properties.county || "",
    state: feature.properties.state || "",
    postcode: feature.properties.postcode || "",
    place_id: feature.properties.place_id || "",
    latitude: Number(feature.properties.lat) || undefined,
    longitude: Number(feature.properties.lon) || undefined,
  }
}

function firstAddressPart(value: string) {
  return value.split(",").map((part) => part.trim()).find(Boolean) || ""
}

function uniqueAddressParts(parts: string[]) {
  const seen = new Set<string>()
  return parts.filter((part) => {
    const clean = part.trim()
    const key = clean.toLowerCase()
    if (!clean || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

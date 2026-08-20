import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const headers = request.headers
  const countryCode = (
    headers.get("x-vercel-ip-country") ||
    headers.get("cf-ipcountry") ||
    headers.get("x-country-code") ||
    ""
  ).trim().toUpperCase()

  return NextResponse.json({
    countryCode,
    country: getCountryName(countryCode),
  })
}

function getCountryName(countryCode: string) {
  if (!/^[A-Z]{2}$/.test(countryCode)) return ""

  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(countryCode) || ""
  } catch {
    return ""
  }
}

import type { MetadataRoute } from "next"
import { kits } from "@/lib/data"

const siteUrl = "https://terracefc.com"

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages = ["", "/collection", "/request-jersey", "/contact"]
    .map((path) => ({ url: `${siteUrl}${path}`, changeFrequency: "weekly" as const, priority: path ? 0.8 : 1 }))

  const productPages = kits
    .filter((kit) => !kit.isDraft && !kit.isPrivate && !kit.isArchived && !kit.isRemoved)
    .map((kit) => ({
      url: `${siteUrl}/kit/${kit.id}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }))

  return [...staticPages, ...productPages]
}

import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api", "/checkout", "/profile"],
    },
    sitemap: "https://terracefc.com/sitemap.xml",
  }
}

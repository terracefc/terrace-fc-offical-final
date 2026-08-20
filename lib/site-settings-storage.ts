import "server-only"
import { readMongoSingleton } from "@/lib/mongodb"
import { defaultSiteSettings, normalizeSiteSettings, type SiteSettings } from "@/lib/site-settings"

const SETTINGS_COLLECTION = "app_storage"
const SETTINGS_DOCUMENT = "site_settings"

export async function readStoredSiteSettings(): Promise<SiteSettings> {
  const stored = await readMongoSingleton(SETTINGS_COLLECTION, SETTINGS_DOCUMENT, defaultSiteSettings)
  return normalizeSiteSettings(stored.value)
}

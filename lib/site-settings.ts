export type SiteSettings = {
  lockdownEnabled: boolean
  testModeEnabled: boolean
  allowedIp: string
}

const SETTINGS_EMAIL = "site-settings@terracefc.local"

export const defaultSiteSettings: SiteSettings = {
  lockdownEnabled: false,
  testModeEnabled: false,
  allowedIp: "122.171.19.152",
}

export function normalizeSiteSettings(value: unknown): SiteSettings {
  const settings = value && typeof value === "object" ? value as Partial<SiteSettings> : {}

  return {
    lockdownEnabled: settings.lockdownEnabled === true,
    testModeEnabled: settings.testModeEnabled === true,
    allowedIp: typeof settings.allowedIp === "string" && settings.allowedIp.trim()
      ? settings.allowedIp.trim()
      : defaultSiteSettings.allowedIp,
  }
}

export function applyTestPrice<T extends { price: number }>(item: T, testModeEnabled: boolean): T {
  return testModeEnabled ? { ...item, price: 1 } : item
}

export async function readSiteSettings(): Promise<SiteSettings> {
  const { isSupabaseAdminConfigured, supabaseAdmin } = await import("@/lib/supabase-admin")
  if (!isSupabaseAdminConfigured || !supabaseAdmin) return defaultSiteSettings

  const { data, error } = await supabaseAdmin.auth.admin.listUsers()
  if (error) return defaultSiteSettings

  const user = data.users.find((candidate) => candidate.email?.toLowerCase() === SETTINGS_EMAIL)
  return normalizeSiteSettings(user?.user_metadata?.site_settings)
}

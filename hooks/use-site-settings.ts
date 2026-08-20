"use client"

import { useEffect, useState } from "react"
import { defaultSiteSettings, type SiteSettings } from "@/lib/site-settings"

export function useSiteSettings() {
  const [settings, setSettings] = useState<SiteSettings>(defaultSiteSettings)

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (data?.settings) setSettings(data.settings)
      })
      .catch(() => null)
  }, [])

  return settings
}

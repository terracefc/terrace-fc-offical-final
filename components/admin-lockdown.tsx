"use client"

import { useEffect, useState } from "react"
import { BadgeIndianRupee, Loader2, Save, ShieldAlert } from "lucide-react"
import { confirmAction } from "@/lib/confirm-action"
import { defaultSiteSettings, type SiteSettings } from "@/lib/site-settings"

export function AdminLockdown() {
  const [settings, setSettings] = useState<SiteSettings>(defaultSiteSettings)
  const [clientIp, setClientIp] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (data.settings) setSettings(data.settings)
        if (data.clientIp) setClientIp(data.clientIp)
      })
      .catch(() => setMessage("Could not load test settings."))
      .finally(() => setIsLoading(false))
  }, [])

  const saveSettings = async (nextSettings = settings) => {
    setIsSaving(true)
    setMessage("")

    try {
      const response = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: nextSettings }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Could not save settings.")

      setSettings(data.settings)
      setMessage("Settings saved. Public site behavior updates immediately.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save settings.")
    } finally {
      setIsSaving(false)
    }
  }

  const updateSettings = (patch: Partial<SiteSettings>) => {
    setMessage("")
    setSettings((current) => ({ ...current, ...patch }))
  }

  const quickEnableTest = async () => {
    if (!(await confirmAction("Are you sure you want to enable Test Place? The public site will be locked to your IP and storefront prices will become ₹1."))) {
      return
    }

    const nextSettings = {
      ...settings,
      lockdownEnabled: true,
      testModeEnabled: true,
      allowedIp: clientIp || settings.allowedIp,
    }
    setSettings(nextSettings)
    saveSettings(nextSettings)
  }

  if (isLoading) {
    return (
      <section className="max-w-3xl rounded-2xl border border-border bg-background/85 p-5 text-sm text-muted-foreground shadow-sm">
        Loading test settings...
      </section>
    )
  }

  return (
    <section className="max-w-4xl rounded-2xl border border-border bg-background/85 p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight">Test Mode Settings</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Lock the public site to your IP and switch storefront prices to ₹1 for live payment, OTP, and email testing.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={quickEnableTest}
          disabled={isSaving}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-foreground px-4 text-xs font-black uppercase tracking-widest text-background disabled:opacity-60"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeIndianRupee className="h-4 w-4" />}
          Enable Test Place
        </button>
      </div>

      {message && (
        <div className="mt-5 rounded-xl border border-accent/30 bg-accent/10 p-3 text-xs font-bold text-accent">
          {message}
        </div>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="rounded-xl border border-border bg-secondary/30 p-4">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Allowed IP</span>
          <input
            value={settings.allowedIp}
            onChange={(event) => updateSettings({ allowedIp: event.target.value })}
            className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-black outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={() => updateSettings({ allowedIp: clientIp || settings.allowedIp })}
            className="mt-2 text-xs font-black uppercase tracking-widest text-accent hover:underline"
          >
            Use my current IP {clientIp ? `(${clientIp})` : ""}
          </button>
        </label>

        <div className="rounded-xl border border-border bg-secondary/30 p-4 space-y-3">
          <ToggleRow
            title="Website Lockdown"
            description="Only the allowed IP can open the public website. Admin stays available."
            checked={settings.lockdownEnabled}
            onChange={(checked) => updateSettings({ lockdownEnabled: checked })}
          />
          <ToggleRow
            title="₹1 Test Prices"
            description="Storefront, cart, checkout, and Razorpay order amounts use ₹1 per item."
            checked={settings.testModeEnabled}
            onChange={(checked) => updateSettings({ testModeEnabled: checked })}
          />
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={async () => {
            if (!(await confirmAction("Are you sure you want to save these test settings? This changes live site behavior immediately."))) return
            saveSettings()
          }}
          disabled={isSaving}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-foreground px-5 text-xs font-black uppercase tracking-widest text-background disabled:opacity-60"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Settings
        </button>
        <button
          type="button"
          onClick={async () => {
            if (!(await confirmAction("Are you sure you want to open the store normally? Lockdown and ₹1 test prices will turn off."))) return
            const nextSettings = { ...settings, lockdownEnabled: false, testModeEnabled: false }
            setSettings(nextSettings)
            saveSettings(nextSettings)
          }}
          disabled={isSaving}
          className="inline-flex h-12 items-center justify-center rounded-xl border border-border px-5 text-xs font-black uppercase tracking-widest hover:bg-secondary disabled:opacity-60"
        >
          Open Store Normally
        </button>
      </div>
    </section>
  )
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-start justify-between gap-3 rounded-xl border border-border bg-background p-3">
      <span>
        <span className="block text-sm font-black">{title}</span>
        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-5 w-5 shrink-0 accent-current"
      />
    </label>
  )
}

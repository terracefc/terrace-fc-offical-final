"use client"

import { useEffect, useState } from "react"
import { Loader2, Save, Trash2 } from "lucide-react"
import { confirmAction } from "@/lib/confirm-action"
import { kits } from "@/lib/data"
import { defaultHomepageContent, type HomepageContent, type HomepageHeroSlide, type HomepagePhoto } from "@/lib/homepage-content"
import { fetchAdminInventory, type EditableKit } from "@/lib/inventory-client"
import { getKitSalePrice } from "@/lib/pricing"

export function AdminHomepage() {
  const [content, setContent] = useState<HomepageContent>(defaultHomepageContent)
  const [inventory, setInventory] = useState<EditableKit[]>(kits)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/homepage", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (data.content) setContent(data.content)
      }),
      fetchAdminInventory(kits).then(setInventory),
    ])
      .catch(() => setMessage("Could not load homepage content."))
      .finally(() => setIsLoading(false))
  }, [])

  const updateField = <Key extends keyof HomepageContent>(key: Key, value: HomepageContent[Key]) => {
    setMessage("")
    setContent((current) => ({ ...current, [key]: value }))
  }

  const addHeroSlide = () => {
    const slide: HomepageHeroSlide = {
      id: `hero-slide-${Date.now()}`,
      kitId: 0,
      src: "/placeholder.jpg",
      alt: "Empty homepage jersey slot",
      tag: "",
      title: "",
      meta: "",
    }
    updateField("heroSlides", [...content.heroSlides, slide])
  }

  const updateHeroSlide = (id: string, patch: Partial<HomepageHeroSlide>) => {
    setMessage("")
    setContent((current) => ({
      ...current,
      heroSlides: current.heroSlides.map((slide) => slide.id === id ? { ...slide, ...patch } : slide),
    }))
  }

  const setSlideKit = (slide: HomepageHeroSlide, kitId: number) => {
    const kit = inventory.find((item) => item.id === kitId)
    updateHeroSlide(slide.id, {
      kitId,
      src: kit.image || slide.src,
      alt: kit.name || slide.alt,
      title: kit ? `${kit.club} ${kit.season}` : slide.title,
      meta: kit ? `₹${getKitSalePrice(kit).toLocaleString("en-IN")} (Size M)` : slide.meta,
      photoId: undefined,
    })
  }

  const removeHeroSlide = async (id: string) => {
    if (!(await confirmAction("Are you sure you want to remove this hero slider slot?"))) return
    setContent((current) => ({
      ...current,
      heroSlides: current.heroSlides.filter((slide) => slide.id !== id),
    }))
  }

  const saveContent = async () => {
    setIsSaving(true)
    setMessage("")

    try {
      const contentToSave = {
        ...content,
        heroSlides: content.heroSlides.map((slide) => {
          const kit = inventory.find((item) => item.id === slide.kitId)
          return kit ? { ...slide, src: kit.image, alt: kit.name } : slide
        }),
      }
      const response = await fetch("/api/admin/homepage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: contentToSave }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Could not save homepage.")

      setContent(data.content)
      setMessage("Homepage saved. Refresh the public site to see the latest content.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save homepage.")
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-background/85 p-5 text-sm text-muted-foreground">
        Loading homepage editor...
      </div>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-2xl border border-border bg-background/85 p-5 shadow-sm space-y-5">
        <div>
          <h2 className="font-black text-xl tracking-tight">Homepage Hero</h2>
          <p className="text-sm text-muted-foreground mt-1">Change the first screen text and jersey slider slots.</p>
        </div>

        {message && (
          <div className="rounded-xl border border-accent/30 bg-accent/10 p-3 text-xs font-bold text-accent">
            {message}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Badge" value={content.badge} onChange={(value) => updateField("badge", value)} />
          <Field label="Featured tag" value={content.featuredTag} onChange={(value) => updateField("featuredTag", value)} />
          <Field label="Headline top" value={content.titleTop} onChange={(value) => updateField("titleTop", value)} />
          <Field label="Headline accent" value={content.titleAccent} onChange={(value) => updateField("titleAccent", value)} />
          <Field label="Primary button" value={content.primaryCta} onChange={(value) => updateField("primaryCta", value)} />
          <Field label="Secondary button" value={content.secondaryCta} onChange={(value) => updateField("secondaryCta", value)} />
          <Field label="Fallback featured kit ID" value={String(content.featuredKitId)} type="number" onChange={(value) => updateField("featuredKitId", Number(value))} />
          <Field label="Featured title" value={content.featuredTitle} onChange={(value) => updateField("featuredTitle", value)} />
          <Field label="Featured meta" value={content.featuredMeta} onChange={(value) => updateField("featuredMeta", value)} className="sm:col-span-2" />
          <label className="space-y-2 sm:col-span-2">
            <span className="block text-xs font-black uppercase tracking-widest text-muted-foreground">Subtitle</span>
            <textarea
              value={content.subtitle}
              onChange={(event) => updateField("subtitle", event.target.value)}
              className="min-h-24 w-full rounded-xl border border-border bg-secondary/30 px-3 py-3 text-sm outline-none focus:border-accent"
            />
          </label>
        </div>

        <div className="rounded-2xl border border-border bg-secondary/20 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-black text-lg tracking-tight">Hero Slider Slots</h3>
              <p className="text-xs text-muted-foreground mt-1">These rotate on the first homepage photo every 2-3 seconds using the selected jersey image.</p>
            </div>
            <button
              type="button"
              onClick={addHeroSlide}
              disabled={content.heroSlides.length >= 12}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border px-4 text-xs font-black uppercase tracking-widest hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add Jersey Slot
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            {content.heroSlides.map((slide, index) => (
              <div key={slide.id} className="grid gap-3 rounded-xl border border-border bg-background p-3 sm:grid-cols-[76px_1fr]">
                <div className="relative aspect-square overflow-hidden rounded-lg border border-border bg-secondary">
                  <PreviewImage photo={{ id: slide.id, src: slide.src, alt: slide.alt }} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">Slot {index + 1} Jersey</span>
                    <select
                      value={slide.kitId}
                      onChange={(event) => setSlideKit(slide, Number(event.target.value))}
                      className="h-10 w-full rounded-xl border border-border bg-secondary/30 px-3 text-xs font-bold outline-none focus:border-accent"
                    >
                      <option value={0}>Empty slot - choose jersey</option>
                      {inventory.map((option) => (
                        <option key={option.id} value={option.id}>
                          #{option.id} {option.name} - {option.club}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Field label="Tag" value={slide.tag} onChange={(tag) => updateHeroSlide(slide.id, { tag })} />
                  <Field label="Title" value={slide.title} onChange={(title) => updateHeroSlide(slide.id, { title })} />
                  <Field label="Meta" value={slide.meta} onChange={(meta) => updateHeroSlide(slide.id, { meta })} />
                  <button
                    type="button"
                    onClick={() => removeHeroSlide(slide.id)}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-red-500/30 text-xs font-black uppercase tracking-widest text-red-500 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Remove Slot
                  </button>
                </div>
              </div>
            ))}
            {content.heroSlides.length === 0 && (
              <div className="rounded-xl border border-dashed border-border bg-background/70 p-6 text-center text-xs font-black uppercase tracking-widest text-muted-foreground">
                No hero jersey slots
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-secondary/20 p-4">
          <div className="mb-4">
            <h3 className="font-black text-lg tracking-tight">Story Section After Leagues</h3>
            <p className="text-xs text-muted-foreground mt-1">Change the picture/jersey area and the text after the league directory.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Story badge" value={content.storyBadge} onChange={(value) => updateField("storyBadge", value)} />
            <Field label="Story title top" value={content.storyTitleTop} onChange={(value) => updateField("storyTitleTop", value)} />
            <Field label="Story title accent" value={content.storyTitleAccent} onChange={(value) => updateField("storyTitleAccent", value)} />
            {[0, 1, 2].map((slot) => (
              <label key={slot} className="space-y-2">
                <span className="block text-xs font-black uppercase tracking-widest text-muted-foreground">Story jersey {slot + 1}</span>
                <select
                  value={content.storyImageKitIds[slot] || 0}
                  onChange={(event) => {
                    const next = [...content.storyImageKitIds]
                    next[slot] = Number(event.target.value)
                    updateField("storyImageKitIds", next.filter((id) => id > 0))
                  }}
                  className="h-11 w-full rounded-xl border border-border bg-background px-3 text-xs font-bold outline-none focus:border-accent"
                >
                  <option value={0}>Empty</option>
                  {inventory.map((option) => (
                    <option key={option.id} value={option.id}>
                      #{option.id} {option.name} - {option.club}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <label className="space-y-2 sm:col-span-2">
              <span className="block text-xs font-black uppercase tracking-widest text-muted-foreground">Story paragraph 1</span>
              <textarea
                value={content.storyParagraphOne}
                onChange={(event) => updateField("storyParagraphOne", event.target.value)}
                className="min-h-24 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none focus:border-accent"
              />
            </label>
            <label className="space-y-2 sm:col-span-2">
              <span className="block text-xs font-black uppercase tracking-widest text-muted-foreground">Story paragraph 2</span>
              <textarea
                value={content.storyParagraphTwo}
                onChange={(event) => updateField("storyParagraphTwo", event.target.value)}
                className="min-h-24 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none focus:border-accent"
              />
            </label>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={saveContent}
            disabled={isSaving}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-foreground px-5 text-xs font-black uppercase tracking-widest text-background disabled:opacity-60"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Homepage
          </button>
          <button
            type="button"
            onClick={() => setContent(defaultHomepageContent)}
            className="inline-flex h-12 items-center justify-center rounded-xl border border-border px-5 text-xs font-black uppercase tracking-widest hover:bg-secondary"
          >
            Reset Draft
          </button>
        </div>
      </section>

      <aside className="rounded-2xl border border-border bg-background/85 p-5 shadow-sm space-y-5">
        <div>
          <h2 className="font-black text-xl tracking-tight">Homepage Jerseys</h2>
          <p className="text-sm text-muted-foreground mt-1">Choose up to 8 jerseys for the main page. The full list stays in Shop Collection.</p>
        </div>

        <div className="space-y-2">
          {content.featuredKitIds.map((id, index) => {
            const kit = inventory.find((item) => item.id === id)
            return (
              <label key={`${id}-${index}`} className="block space-y-1">
                <span className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">Slot {index + 1}</span>
                <select
                  value={id}
                  onChange={(event) => {
                    const nextId = Number(event.target.value)
                    setContent((current) => ({
                      ...current,
                      featuredKitIds: current.featuredKitIds.map((item, itemIndex) => itemIndex === index ? nextId : item),
                    }))
                  }}
                  className="h-10 w-full rounded-xl border border-border bg-secondary/30 px-3 text-xs font-bold outline-none focus:border-accent"
                >
                  {inventory.map((option) => (
                    <option key={option.id} value={option.id}>
                      #{option.id} {option.name} - {option.club}
                    </option>
                  ))}
                </select>
                {kit && <p className="text-[10px] text-muted-foreground">{kit.season}</p>}
              </label>
            )
          })}
          {content.featuredKitIds.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-5 text-center text-xs font-black uppercase tracking-widest text-muted-foreground">
              No homepage jersey slots
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            disabled={content.featuredKitIds.length >= 8}
            onClick={() => updateField("featuredKitIds", [...content.featuredKitIds, inventory[0].id || 1])}
            className="h-10 flex-1 rounded-xl border border-border text-xs font-black uppercase tracking-widest hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add Slot
          </button>
          <button
            type="button"
            onClick={async () => {
              if (!(await confirmAction("Are you sure you want to remove the last homepage jersey slot?"))) return
              updateField("featuredKitIds", content.featuredKitIds.slice(0, -1))
            }}
            className="h-10 flex-1 rounded-xl border border-border text-xs font-black uppercase tracking-widest hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            Remove Slot
          </button>
        </div>

      </aside>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  className = "",
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  className?: string
}) {
  return (
    <label className={`space-y-2 ${className}`}>
      <span className="block text-xs font-black uppercase tracking-widest text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-xl border border-border bg-secondary/30 px-3 text-sm outline-none focus:border-accent"
      />
    </label>
  )
}

function PreviewImage({ photo }: { photo: HomepagePhoto }) {
  return <img src={photo.src} alt={photo.alt} className="h-full w-full object-cover" />
}

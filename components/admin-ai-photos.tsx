"use client"

import { useEffect, useMemo, useState } from "react"
import { Check, Copy, Crop, ImagePlus, Save, Upload } from "lucide-react"

type SavedPreparedPhoto = {
  id: string
  title: string
  description: string
  imageUrl: string
  createdAt: string
}

const STORAGE_KEY = "terrace_prepared_jersey_photos"

export function AdminAiPhotos() {
  const [title, setTitle] = useState("")
  const [club, setClub] = useState("")
  const [season, setSeason] = useState("")
  const [description, setDescription] = useState("")
  const [source, setSource] = useState("")
  const [cropped, setCropped] = useState("")
  const [cropZoom, setCropZoom] = useState(1)
  const [cropX, setCropX] = useState(0)
  const [cropY, setCropY] = useState(0)
  const [message, setMessage] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [copied, setCopied] = useState("")
  const [savedPhotos, setSavedPhotos] = useState<SavedPreparedPhoto[]>([])

  useEffect(() => {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]")
      if (Array.isArray(parsed)) setSavedPhotos(parsed)
    } catch {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  const displayTitle = title.trim() || [club, season].filter(Boolean).join(" ").trim() || "Prepared jersey photo"
  const suggestedDescription = useMemo(() => {
    const name = displayTitle
    const details = [club && `for ${club}`, season && `from ${season}`].filter(Boolean).join(" ")
    return `${name} ${details} is prepared with a clean product crop, clear jersey details, and a polished football-store presentation.`
  }, [club, displayTitle, season])

  const resetCrop = () => {
    setCropZoom(1)
    setCropX(0)
    setCropY(0)
    setCropped("")
    setMessage("")
  }

  const prepareCrop = async () => {
    if (!source) {
      setMessage("Upload the jersey image first.")
      return
    }
    setMessage("")
    try {
      const next = await cropImageToSquare(source, cropZoom, cropX, cropY)
      setCropped(next)
      setMessage("Crop ready. Save it when it looks correct.")
      if (!description.trim()) setDescription(suggestedDescription)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not crop this image.")
    }
  }

  const savePhoto = async () => {
    const image = cropped || source
    if (!image) {
      setMessage("Upload and crop an image before saving.")
      return
    }

    setIsSaving(true)
    setMessage("")
    try {
      const finalImage = await cropImageToSquare(image, 1, 0, 0, 900, 0.86)
      const response = await fetch("/api/inventory/upload-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: finalImage,
          kitId: "prepared-photos",
          side: sanitizeFilePart(displayTitle),
          previousUrl: "",
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || typeof data?.publicUrl !== "string") {
        throw new Error(data?.error || "Could not save this jersey photo.")
      }

      const nextPhoto: SavedPreparedPhoto = {
        id: crypto.randomUUID(),
        title: displayTitle,
        description: description.trim() || suggestedDescription,
        imageUrl: data.publicUrl,
        createdAt: new Date().toISOString(),
      }
      const nextPhotos = [nextPhoto, ...savedPhotos].slice(0, 24)
      setSavedPhotos(nextPhotos)
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextPhotos))
      setMessage("Jersey photo saved. Copy the image URL below when you need it.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save this jersey photo.")
    } finally {
      setIsSaving(false)
    }
  }

  const copyText = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value)
    setCopied(label)
    window.setTimeout(() => setCopied(""), 1400)
  }

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-border bg-background p-5 shadow-sm">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-accent">Jersey Photo Prep</p>
          <h2 className="mt-1 text-2xl font-black tracking-tight">Upload, Crop, Save</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Upload the jersey image here. I can handle the perfect crop and final description with you in chat, then you can save the finished image here.
          </p>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Title" value={title} onChange={setTitle} placeholder="Mbappe Real Madrid Away" />
              <TextField label="Club / Country" value={club} onChange={setClub} placeholder="Real Madrid" />
            </div>
            <TextField label="Season / Notes" value={season} onChange={setSeason} placeholder="2024-2025 away" />
            <label className="space-y-2">
              <span className="block text-xs font-black uppercase tracking-widest text-muted-foreground">Description</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={suggestedDescription}
                className="min-h-32 w-full rounded-xl border border-border bg-secondary/20 p-3 text-sm font-bold outline-none focus:border-accent"
              />
            </label>
            <button
              type="button"
              onClick={() => setDescription(suggestedDescription)}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border px-4 text-xs font-black uppercase tracking-widest hover:bg-secondary"
            >
              Use Suggested Description
            </button>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-white p-3">
              <div className="aspect-square overflow-hidden rounded-xl bg-secondary">
                {source ? (
                  <img
                    src={cropped || source}
                    alt="Jersey crop preview"
                    className="h-full w-full object-contain"
                    style={!cropped ? { transform: `translate(${cropX}%, ${cropY}%) scale(${cropZoom})`, transformOrigin: "center" } : undefined}
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
                    <ImagePlus className="h-10 w-10" />
                    <p className="text-xs font-black uppercase tracking-widest">Upload Jersey Image</p>
                  </div>
                )}
              </div>
            </div>

            <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border text-xs font-black uppercase tracking-widest hover:bg-secondary">
              <Upload className="h-4 w-4" />
              Upload Image
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0]
                  if (!file) return
                  setSource(await fileToDataUrl(file))
                  resetCrop()
                  event.currentTarget.value = ""
                }}
              />
            </label>

            {source && (
              <div className="grid gap-3">
                <CropSlider label="Zoom" min={1} max={3} step={0.05} value={cropZoom} onChange={(value) => { setCropZoom(value); setCropped("") }} />
                <CropSlider label="Move left / right" min={-40} max={40} step={1} value={cropX} onChange={(value) => { setCropX(value); setCropped("") }} />
                <CropSlider label="Move up / down" min={-40} max={40} step={1} value={cropY} onChange={(value) => { setCropY(value); setCropped("") }} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={prepareCrop}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 text-xs font-black uppercase tracking-widest hover:bg-secondary"
                  >
                    <Crop className="h-4 w-4" />
                    Crop Photo
                  </button>
                  <button
                    type="button"
                    onClick={savePhoto}
                    disabled={isSaving}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-foreground px-4 text-xs font-black uppercase tracking-widest text-background disabled:opacity-60"
                  >
                    <Save className="h-4 w-4" />
                    {isSaving ? "Saving..." : "Save Image"}
                  </button>
                </div>
              </div>
            )}

            {message && <p className="rounded-xl border border-border bg-secondary/20 p-3 text-xs font-bold text-muted-foreground">{message}</p>}
          </div>
        </div>
      </div>

      {savedPhotos.length > 0 && (
        <div className="rounded-2xl border border-border bg-background p-5 shadow-sm">
          <p className="mb-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Saved Prepared Photos</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {savedPhotos.map((photo) => (
              <article key={photo.id} className="rounded-xl border border-border bg-secondary/20 p-3">
                <img src={photo.imageUrl} alt={photo.title} className="aspect-square w-full rounded-lg bg-white object-cover" />
                <h3 className="mt-3 text-sm font-black">{photo.title}</h3>
                <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{photo.description}</p>
                <button
                  type="button"
                  onClick={() => copyText(photo.imageUrl, photo.id)}
                  className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border text-xs font-black uppercase tracking-widest hover:bg-secondary"
                >
                  {copied === photo.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  Copy URL
                </button>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="space-y-2">
      <span className="block text-xs font-black uppercase tracking-widest text-muted-foreground">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-xl border border-border bg-secondary/20 px-3 text-sm font-bold outline-none focus:border-accent"
      />
    </label>
  )
}

function CropSlider({ label, min, max, step, value, onChange }: { label: string; min: number; max: number; step: number; value: number; onChange: (value: number) => void }) {
  return (
    <label className="space-y-1">
      <span className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-current"
      />
    </label>
  )
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function cropImageToSquare(source: string, zoom: number, offsetXPercent: number, offsetYPercent: number, size = 900, quality = 0.9) {
  return new Promise<string>((resolve, reject) => {
    const image = document.createElement("img")
    image.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = size
      canvas.height = size
      const context = canvas.getContext("2d")
      if (!context) {
        reject(new Error("Canvas is unavailable."))
        return
      }

      context.fillStyle = "#ffffff"
      context.fillRect(0, 0, size, size)
      const baseScale = Math.min(size / image.naturalWidth, size / image.naturalHeight)
      const drawWidth = image.naturalWidth * baseScale * zoom
      const drawHeight = image.naturalHeight * baseScale * zoom
      const x = (size - drawWidth) / 2 + (offsetXPercent / 100) * size
      const y = (size - drawHeight) / 2 + (offsetYPercent / 100) * size
      context.drawImage(image, x, y, drawWidth, drawHeight)
      resolve(canvas.toDataURL("image/webp", quality))
    }
    image.onerror = () => reject(new Error("Image could not be loaded."))
    image.src = source
  })
}

function sanitizeFilePart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "prepared-photo"
}

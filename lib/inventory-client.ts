import type { Kit } from "@/lib/data"
import { kits } from "@/lib/data"
import { supabase, isSupabaseConfigured } from "./supabase"
import type { OrderItem } from "./orders"

export const REMOVED_KITS_KEY = "terrace_removed_kit_ids"
export const CUSTOM_KITS_KEY = "terrace_custom_kits"
export const KIT_EDITS_KEY = "terrace_kit_edits"
export const PRIVATE_KITS_KEY = "terrace_private_kit_ids"
export const DRAFT_KITS_KEY = "terrace_draft_kit_ids"
export const ARCHIVED_KITS_KEY = "terrace_archived_kit_ids"
const STOCK_INITIALIZED_KEY = "terrace_stock_initialized_v5"
const PUBLIC_INVENTORY_CACHE_KEY = "terrace_public_inventory_cache_v1"
const ADMIN_INVENTORY_CACHE_KEY = "terrace_admin_inventory_cache_v1"
export const KIT_SIZES = ["S", "M", "L", "XL"] as const
export const KIDS_SIZE_OPTIONS = [
  { size: "16", label: "1-2 Years" },
  { size: "18", label: "2-3 Years" },
  { size: "20", label: "3-4 Years" },
  { size: "22", label: "4-5 Years" },
  { size: "24", label: "5-6 Years" },
  { size: "26", label: "6-7 Years" },
  { size: "28", label: "7-8 Years" },
  { size: "30", label: "8-10 Years" },
  { size: "32", label: "10-12 Years" },
  { size: "34", label: "12-14 Years" },
] as const
export type KitSize = string
export type SizeStock = Record<string, number>
type StockableKit = Pick<Kit, "stock" | "sizeStock"> & Partial<Pick<Kit, "productType">>

export type EditableKit = Kit & {
  isCustom?: boolean
  isPrivate?: boolean
  isDraft?: boolean
  isArchived?: boolean
  isRemoved?: boolean
}

export function readAdminInventory(baseKits: Kit[]) {
  initializeStockDefaults()

  const customKits = readArray<EditableKit>(CUSTOM_KITS_KEY)
  const kitEdits = readRecord<Partial<EditableKit>>(KIT_EDITS_KEY)

  return [
    ...baseKits.map((kit) => withDefaultStock({ ...kit, ...(kitEdits[kit.id] || {}) })),
    ...customKits.map(withDefaultStock),
  ] as EditableKit[]
}

export function readPublicInventory(baseKits: Kit[]) {
  const privateIds = readNumberArray(PRIVATE_KITS_KEY)
  const draftIds = readNumberArray(DRAFT_KITS_KEY)
  const archivedIds = readNumberArray(ARCHIVED_KITS_KEY)
  const removedIds = readNumberArray(REMOVED_KITS_KEY)

  return preferLocalBaseImages(readAdminInventory(baseKits), baseKits).filter((kit) => {
    return !kit.isPrivate && !kit.isDraft && !kit.isArchived && !kit.isRemoved && !privateIds.includes(kit.id) && !draftIds.includes(kit.id) && !archivedIds.includes(kit.id) && !removedIds.includes(kit.id)
  })
}

export function readNumberArray(key: string) {
  return readArray<number>(key).filter((item) => typeof item === "number")
}

export function getKitStock(kit: StockableKit) {
  const totalSizeStock = getKitTotalSizeStock(kit)
  if (totalSizeStock > 0 || kit.sizeStock) return totalSizeStock

  return typeof kit.stock === "number" && Number.isFinite(kit.stock) ? Math.max(0, Math.floor(kit.stock)) : 0
}

export function getKitSizeStock(kit: StockableKit, size: string) {
  const normalized = normalizeSizeStock(kit)
  return normalized[size] || 0
}

export function getKitTotalSizeStock(kit: StockableKit) {
  const sizes = getSelectableKitSizes(kit)
  return sizes.reduce((sum, size) => sum + (normalizeSizeStock(kit)[size] || 0), 0)
}

export function normalizeSizeStock(kit: StockableKit): SizeStock {
  const sizeStock = kit.sizeStock || {}
  const sizes = getSelectableKitSizes(kit)
  const normalized = Object.fromEntries(
    sizes.map((size) => {
      const value = sizeStock[size]
      return [size, typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0]
    })
  ) as SizeStock

  if (sizes.some((size) => normalized[size] > 0) || kit.sizeStock) return normalized

  const fallbackStock = typeof kit.stock === "number" && Number.isFinite(kit.stock) ? Math.max(0, Math.floor(kit.stock)) : 0
  return Object.fromEntries(sizes.map((size) => [size, fallbackStock])) as SizeStock
}

export function withDefaultStock<T extends Kit>(kit: T) {
  const sizeStock = normalizeSizeStock(kit)

  return {
    ...kit,
    sizeStock,
    stock: getSelectableKitSizes(kit).reduce((sum, size) => sum + (sizeStock[size] || 0), 0),
  }
}

export function isKidsKit(kit: Partial<Pick<Kit, "productType" | "league" | "season" | "badge" | "name">>) {
  const text = `${kit.productType || ""} ${kit.league || ""} ${kit.season || ""} ${kit.badge || ""} ${kit.name || ""}`.toLowerCase()
  return kit.productType === "kids" || text.includes("kids") || text.includes("kid ")
}

export function getSelectableKitSizes(kit: Partial<Pick<Kit, "productType" | "league" | "season" | "badge" | "name">>) {
  return isKidsKit(kit) ? KIDS_SIZE_OPTIONS.map((option) => option.size) : [...KIT_SIZES]
}

export function getSizeDisplayLabel(kit: Partial<Pick<Kit, "productType" | "league" | "season" | "badge" | "name">>, size: string) {
  if (!isKidsKit(kit)) return size
  return KIDS_SIZE_OPTIONS.find((option) => option.size === size)?.label || size
}

function initializeStockDefaults() {
  if (typeof window === "undefined" || window.localStorage.getItem(STOCK_INITIALIZED_KEY)) return

  window.localStorage.setItem(CUSTOM_KITS_KEY, JSON.stringify([]))
  window.localStorage.setItem(KIT_EDITS_KEY, JSON.stringify({}))
  window.localStorage.setItem(DRAFT_KITS_KEY, JSON.stringify([]))
  
  // Clear old catalog state for the generated jersey drop.
  window.localStorage.removeItem(PRIVATE_KITS_KEY)
  window.localStorage.removeItem(ARCHIVED_KITS_KEY)
  window.localStorage.removeItem(REMOVED_KITS_KEY)

  window.localStorage.setItem(STOCK_INITIALIZED_KEY, "true")
}

function readArray<T>(key: string): T[] {
  if (typeof window === "undefined") return []

  try {
    const stored = window.localStorage.getItem(key)
    const parsed = stored ? JSON.parse(stored) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    window.localStorage.removeItem(key)
    return []
  }
}

function readRecord<T>(key: string) {
  if (typeof window === "undefined") return {} as Record<number, T>

  try {
    const stored = window.localStorage.getItem(key)
    const parsed = stored ? JSON.parse(stored) : {}
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<number, T> : {}
  } catch {
    window.localStorage.removeItem(key)
    return {} as Record<number, T>
  }
}

export function restockOrderItems(items: OrderItem[]) {
  if (typeof window === "undefined") return

  const customKits = readArray<EditableKit>(CUSTOM_KITS_KEY)
  const kitEdits = readRecord<Partial<EditableKit>>(KIT_EDITS_KEY)

  const nextCustomKits = [...customKits]
  const nextKitEdits = { ...kitEdits }

  for (const item of items) {
    const isCustom = customKits.some((k) => k.id === item.id)

    if (isCustom) {
      const idx = nextCustomKits.findIndex((k) => k.id === item.id)
      if (idx > -1) {
        const kit = nextCustomKits[idx]
        const sizeStock = normalizeSizeStock(kit)
        const size = item.size as KitSize
        sizeStock[size] = (sizeStock[size] || 0) + item.quantity
        
        nextCustomKits[idx] = {
          ...kit,
          sizeStock,
          stock: (kit.stock || 0) + item.quantity
        }
      }
    } else {
      const baseKit = kits.find((k) => k.id === item.id)
      if (baseKit) {
        const currentEdit = nextKitEdits[item.id] || {}
        const mergedKit = { ...baseKit, ...currentEdit }
        const sizeStock = normalizeSizeStock(mergedKit)
        const size = item.size as KitSize
        sizeStock[size] = (sizeStock[size] || 0) + item.quantity

        nextKitEdits[item.id] = {
          ...currentEdit,
          sizeStock,
          stock: (mergedKit.stock || 0) + item.quantity
        }
      }
    }

    if (isSupabaseConfigured) {
      supabase.from("kits").select("size_stock, stock").eq("id", item.id).single().then(({ data, error }: { data: any; error: any }) => {
        if (!error && data) {
          const currentSizeStock = data.size_stock || { S: 0, M: 0, L: 0, XL: 0 }
          const newSizeStock = { ...currentSizeStock }
          newSizeStock[item.size] = (newSizeStock[item.size] || 0) + item.quantity
          const newTotalStock = (data.stock || 0) + item.quantity

          supabase.from("kits").update({
            size_stock: newSizeStock,
            stock: newTotalStock
          }).eq("id", item.id).then(({ error: updateError }: { error: any }) => {
            if (updateError) console.error("Error restocking kit in Supabase:", updateError)
          })
        }
      })
    }
  }

  window.localStorage.setItem(CUSTOM_KITS_KEY, JSON.stringify(nextCustomKits))
  window.localStorage.setItem(KIT_EDITS_KEY, JSON.stringify(nextKitEdits))
}

export function decrementOrderItems(items: OrderItem[]) {
  return
}

export async function fetchAdminInventory(baseKits: Kit[]): Promise<EditableKit[]> {
  if (!isSupabaseConfigured) {
    return readAdminInventory(baseKits)
  }

  const response = await fetch(`/api/inventory?scope=admin&t=${Date.now()}`, { cache: "no-store" })
  if (!response.ok) {
    return baseKits.map(withDefaultStock)
  }

  const data = await response.json().catch(() => null)
  const inventory = Array.isArray(data?.kits) ? data.kits as EditableKit[] : baseKits.map(withDefaultStock)
  writeInventoryCache(ADMIN_INVENTORY_CACHE_KEY, inventory)
  return inventory
}

export async function fetchPublicInventory(baseKits: Kit[]): Promise<EditableKit[]> {
  if (!isSupabaseConfigured) {
    return readPublicInventory(baseKits)
  }

  const response = await fetch(`/api/inventory?scope=public&t=${Date.now()}`, { cache: "no-store" })
  if (!response.ok) {
    return readPublicInventory(baseKits)
  }

  const data = await response.json().catch(() => null)
  const inventory = Array.isArray(data?.kits) ? preferLocalBaseImages(data.kits as EditableKit[], baseKits) : readPublicInventory(baseKits)
  writeInventoryCache(PUBLIC_INVENTORY_CACHE_KEY, inventory)
  return inventory
}

export function readCachedAdminInventory(baseKits: Kit[]) {
  if (!isSupabaseConfigured) return readAdminInventory(baseKits)
  const cached = readInventoryCache(ADMIN_INVENTORY_CACHE_KEY)
  return cached.length > 0 ? cached : baseKits.map(withDefaultStock)
}

export function readCachedPublicInventory(baseKits: Kit[]) {
  if (!isSupabaseConfigured) return readPublicInventory(baseKits)
  const cached = readInventoryCache(PUBLIC_INVENTORY_CACHE_KEY)
  return cached.length > 0 ? preferLocalBaseImages(cached, baseKits) : readPublicInventory(baseKits)
}

export function preferLocalBaseImages<T extends Kit>(inventory: T[], baseKits: Kit[]) {
  const baseById = new Map(baseKits.map((kit) => [kit.id, kit]))
  return inventory.map((kit) => {
    const baseKit = baseById.get(kit.id)
    if (!baseKit) return kit
    return {
      ...kit,
      image: baseKit.image,
      backImage: baseKit.backImage || baseKit.image,
    }
  })
}

function readInventoryCache(key: string) {
  if (typeof window === "undefined") return []

  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "[]")
    return Array.isArray(parsed) ? parsed as EditableKit[] : []
  } catch {
    window.localStorage.removeItem(key)
    return []
  }
}

function writeInventoryCache(key: string, inventory: EditableKit[]) {
  if (typeof window === "undefined") return

  try {
    window.localStorage.setItem(key, JSON.stringify(inventory))
  } catch {
    // Ignore quota failures; live inventory remains the source of truth.
  }
}

export async function saveInventoryKit(kit: EditableKit, status: "active" | "inactive" | "draft", isRemoved = false) {
  const response = await fetch("/api/inventory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ kit, status, isRemoved }),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.error || "Could not save inventory.")
  }

  return (data?.kit || kit) as EditableKit
}

export async function updateInventoryKits(ids: number[], updates: Partial<EditableKit> & { status?: "active" | "inactive" | "draft" }) {
  const response = await fetch("/api/inventory", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ ids, updates }),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.error || "Could not update inventory.")
  }

  return (Array.isArray(data?.kits) ? data.kits : []) as EditableKit[]
}

export async function deleteInventoryKit(id: number) {
  const response = await fetch("/api/inventory", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ id, deleteAlbumPhotos: true }),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.error || "Could not delete this jersey.")
  }

  return {
    albumPhotosRemoved: Number(data?.albumPhotosRemoved || 0),
    kit: data?.kit as EditableKit | undefined,
  }
}

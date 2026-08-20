import { NextResponse } from "next/server"
import { kits as baseKits } from "@/lib/data"
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin"
import { normalizeSizeStock, preferLocalBaseImages, type EditableKit } from "@/lib/inventory-client"
import { readStoredInventory, updateStoredInventoryKits, upsertStoredInventoryKit } from "@/lib/inventory-storage"
import { isAdminRequest } from "@/lib/admin-auth"
import { isMongoConfigured } from "@/lib/mongodb"
import { readdir, rm } from "fs/promises"
import path from "path"

const CONTENT_EMAIL = "site-content@terracefc.local"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request) {
  const scope = new URL(request.url).searchParams.get("scope") || "public"

  if (isMongoConfigured) {
    const stored = await readStoredInventory()
    if (stored.error) return NextResponse.json({ kits: filterInventoryForScope(baseKits, scope), storage: "fallback", warning: stored.error })
    return NextResponse.json({ kits: filterInventoryForScope(mergeInventory(stored.kits), scope), storage: "mongodb" })
  }

  if (!isSupabaseAdminConfigured || !supabaseAdmin) {
    return NextResponse.json({ kits: filterInventoryForScope(baseKits, scope) })
  }

  const { data, error } = await supabaseAdmin.from("kits").select("*").order("id", { ascending: true })

  if (error) {
    if (isMissingKitsTableError(error)) {
      const stored = await readStoredInventory()
      if (stored.error) return NextResponse.json({ kits: filterInventoryForScope(baseKits, scope), storage: "fallback" })
      return NextResponse.json({ kits: filterInventoryForScope(mergeInventory(stored.kits), scope), storage: "metadata" })
    }
    return NextResponse.json({ kits: filterInventoryForScope(baseKits, scope), storage: "fallback", warning: error.message })
  }

  return NextResponse.json({ kits: filterInventoryForScope(mergeInventory((data || []).map(mapKitRow)), scope) })
}

export async function POST(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "Admin access is required." }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const kit = body?.kit as EditableKit | undefined
  const status = body?.status === "inactive" || body?.status === "draft" ? body.status : "active"

  if (!kit?.id || !kit.name || !kit.club) {
    return NextResponse.json({ error: "Jersey payload is incomplete." }, { status: 400 })
  }

  if (isMongoConfigured || !isSupabaseAdminConfigured || !supabaseAdmin) {
    const savedKit = rowToKit(kitToRow(kit, status, !!body?.isRemoved))
    const stored = await upsertStoredInventoryKit(savedKit)
    if (stored.error) return NextResponse.json({ error: stored.error }, { status: 500 })
    await syncHomepageKitImage(savedKit)
    return NextResponse.json({ ok: true, kit: savedKit, storage: isMongoConfigured ? "mongodb" : "metadata" })
  }

  const { error } = await supabaseAdmin.from("kits").upsert([kitToRow(kit, status, !!body?.isRemoved)], { onConflict: "id" })

  if (error) {
    if (isMissingKitsTableError(error)) {
      const stored = await upsertStoredInventoryKit(rowToKit(kitToRow(kit, status, !!body?.isRemoved)))
      if (stored.error) return NextResponse.json({ error: stored.error }, { status: 500 })
      const savedKit = rowToKit(kitToRow(kit, status, !!body?.isRemoved))
      await syncHomepageKitImage(savedKit)
      return NextResponse.json({ ok: true, kit: savedKit, tableMissing: true, storage: "metadata" })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const savedKit = rowToKit(kitToRow(kit, status, !!body?.isRemoved))
  await syncHomepageKitImage(savedKit)
  return NextResponse.json({ ok: true, kit: savedKit })
}

export async function PATCH(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "Admin access is required." }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id: unknown) => typeof id === "number") : []
  const updates = body?.updates || {}

  if (ids.length === 0) {
    return NextResponse.json({ error: "Select at least one jersey." }, { status: 400 })
  }

  if (isMongoConfigured || !isSupabaseAdminConfigured || !supabaseAdmin) {
    const current = await readStoredInventory()
    if (current.error) return NextResponse.json({ error: current.error }, { status: 500 })
    const currentInventory = mergeInventory(current.kits)
    const nextKits = ids.map((id: number) => {
      const currentKit = currentInventory.find((kit) => kit.id === id) || baseKits.find((kit) => kit.id === id)
      if (!currentKit) return null
      return rowToKit(kitToRow({ ...currentKit, ...updates } as EditableKit, updates.status || statusFromKit(currentKit), updates.isRemoved ?? !!currentKit.isRemoved))
    }).filter(Boolean) as EditableKit[]
    const saved = await Promise.all(nextKits.map((kit) => upsertStoredInventoryKit(kit)))
    const failed = saved.find((item) => item.error)
    if (failed?.error) return NextResponse.json({ error: failed.error }, { status: 500 })
    return NextResponse.json({ ok: true, kits: nextKits, storage: isMongoConfigured ? "mongodb" : "metadata" })
  }

  const existingRows = await supabaseAdmin.from("kits").select("*").in("id", ids)

  if (existingRows.error) {
    if (isMissingKitsTableError(existingRows.error)) {
      const current = await readStoredInventory()
      if (current.error) return NextResponse.json({ error: current.error }, { status: 500 })
      const currentInventory = mergeInventory(current.kits)
      const existingById = new Map(currentInventory.map((kit: EditableKit) => [kit.id, kit]))
      const nextKits = ids.map((id: number) => {
        const currentKit = existingById.get(id)
        if (!currentKit) return null
        return rowToKit(kitToRow({ ...currentKit, ...updates } as EditableKit, updates.status || statusFromKit(currentKit), updates.isRemoved ?? !!currentKit.isRemoved))
      }).filter((kit: EditableKit | null): kit is EditableKit => Boolean(kit))
      const saved = await Promise.all(nextKits.map((kit: EditableKit) => upsertStoredInventoryKit(kit)))
      const failed = saved.find((result) => result.error)
      if (failed?.error) return NextResponse.json({ error: failed.error }, { status: 500 })
      return NextResponse.json({ ok: true, kits: nextKits, tableMissing: true, storage: "metadata" })
    }
    return NextResponse.json({ error: existingRows.error.message }, { status: 500 })
  }

  const existingById = new Map((existingRows.data || []).map((row) => [Number(row.id), mapKitRow(row)]))
  const rows = ids.map((id: number) => {
    const current = existingById.get(id) || baseKits.find((kit) => kit.id === id)
    if (!current) return null
    const nextKit = { ...current, ...updates } as EditableKit
    return kitToRow(nextKit, updates.status || statusFromKit(current as EditableKit), updates.isRemoved ?? !!(current as EditableKit).isRemoved)
  }).filter(Boolean)

  if (rows.length === 0) {
    return NextResponse.json({ error: "No matching jerseys were found." }, { status: 404 })
  }

  const { error } = await supabaseAdmin.from("kits").upsert(rows, { onConflict: "id" })

  if (error) {
    if (isMissingKitsTableError(error)) {
      const saved = await updateStoredInventoryKits(ids, updates)
      if (saved.error) return NextResponse.json({ error: saved.error }, { status: 500 })
      return NextResponse.json({ ok: true, tableMissing: true, storage: "metadata" })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, kits: rows.map(rowToKit) })
}

export async function DELETE(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "Admin access is required." }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const id = Number(body?.id)
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "A valid jersey ID is required." }, { status: 400 })
  }

  const archived = await archiveInventoryKit(id)
  if (!archived.kit) return NextResponse.json({ error: "Jersey not found." }, { status: 404 })
  if (archived.error) return NextResponse.json({ error: archived.error }, { status: 500 })

  const albumPhotosRemoved = body?.deleteAlbumPhotos === true
    ? await deleteMatchingAlbumPhotos(archived.kit)
    : 0
  const kitAssetsRemoved = await deleteUnreferencedKitAssets(archived.kit)

  return NextResponse.json({ ok: true, kit: archived.kit, albumPhotosRemoved, kitAssetsRemoved })
}

async function archiveInventoryKit(id: number) {
  if (isMongoConfigured || !isSupabaseAdminConfigured || !supabaseAdmin) {
    const current = await readStoredInventory()
    if (current.error) return { kit: null, error: current.error }
    const kit = mergeInventory(current.kits).find((item) => item.id === id)
    if (!kit) return { kit: null, error: null }
    const archived = { ...kit, isRemoved: true, isArchived: true }
    const saved = await upsertStoredInventoryKit(archived)
    return { kit: archived, error: saved.error || null }
  }

  const { data, error } = await supabaseAdmin.from("kits").select("*").eq("id", id).maybeSingle()
  if (error && !isMissingKitsTableError(error)) return { kit: null, error: error.message }

  if (error || !data) {
    const current = await readStoredInventory()
    if (current.error) return { kit: null, error: current.error }
    const kit = mergeInventory(current.kits).find((item) => item.id === id)
    if (!kit) return { kit: null, error: null }
    const archived = { ...kit, isRemoved: true, isArchived: true }
    const saved = await upsertStoredInventoryKit(archived)
    return { kit: archived, error: saved.error || null }
  }

  const kit = mapKitRow(data)
  const archived = { ...kit, isRemoved: true, isArchived: true }
  const { error: saveError } = await supabaseAdmin.from("kits").upsert([kitToRow(archived, statusFromKit(archived), true)], { onConflict: "id" })
  if (saveError) return { kit: null, error: saveError.message }
  if (isMongoConfigured) await upsertStoredInventoryKit(archived)
  return { kit: archived, error: null }
}

async function deleteMatchingAlbumPhotos(kit: EditableKit) {
  const albumDirectory = path.join(process.cwd(), "Football Jersey Photos")
  const files = await readdir(albumDirectory).catch(() => [])
  const matches = files.filter((file) => matchesAlbumPhoto(file, kit))
  await Promise.all(matches.map((file) => rm(path.join(albumDirectory, file), { force: true })))
  return matches.length
}

async function deleteUnreferencedKitAssets(kit: EditableKit) {
  const candidatePaths = [kit.image, kit.backImage]
    .map(getPublicKitAssetPath)
    .filter((filePath): filePath is string => Boolean(filePath))

  if (candidatePaths.length === 0) return 0

  const currentInventory = await readCurrentInventoryForAssetCheck()
  const usedAssetPaths = new Set(
    currentInventory
      .filter((item) => !item.isRemoved && !item.isArchived)
      .flatMap((item) => [item.image, item.backImage])
      .map(getPublicKitAssetPath)
      .filter((filePath): filePath is string => Boolean(filePath)),
  )

  const removablePaths = Array.from(new Set(candidatePaths.filter((filePath) => !usedAssetPaths.has(filePath))))
  await Promise.all(removablePaths.map((filePath) => rm(filePath, { force: true })))
  return removablePaths.length
}

async function readCurrentInventoryForAssetCheck() {
  if (isMongoConfigured || !isSupabaseAdminConfigured || !supabaseAdmin) {
    const stored = await readStoredInventory()
    return stored.error ? mergeInventory([]) : mergeInventory(stored.kits)
  }

  const { data, error } = await supabaseAdmin.from("kits").select("*")
  if (!error) return mergeInventory((data || []).map(mapKitRow))

  const stored = await readStoredInventory()
  return stored.error ? mergeInventory([]) : mergeInventory(stored.kits)
}

function getPublicKitAssetPath(value: unknown) {
  const publicDirectory = path.resolve(process.cwd(), "public")
  const kitsDirectory = path.resolve(publicDirectory, "kits")
  const assetPath = String(value || "")
  if (!assetPath.startsWith("/kits/")) return null

  const resolvedPath = path.resolve(publicDirectory, assetPath.slice(1))
  return resolvedPath.startsWith(`${kitsDirectory}${path.sep}`) ? resolvedPath : null
}

function matchesAlbumPhoto(fileName: string, kit: EditableKit) {
  const photoTokens = meaningfulTokens(fileName)
  const clubTokens = meaningfulTokens(kit.club)
  const nameTokens = meaningfulTokens(kit.name)
  const seasonTokens = meaningfulTokens(kit.season)
  const overlap = (tokens: Iterable<string>) => Array.from(tokens).filter((token) => photoTokens.has(token)).length
  const clubMatches = overlap(clubTokens)
  const productMatches = overlap(nameTokens)
  const seasonMatches = overlap(seasonTokens)

  // Requiring a club token and a second product/season anchor avoids deleting an
  // unrelated photo that merely shares a common word such as "home" or "retro".
  return clubMatches > 0 && (productMatches > 0 || seasonMatches > 0) && clubMatches + productMatches + seasonMatches >= 2
}

function meaningfulTokens(value: string) {
  const ignored = new Set(["jersey", "kit", "home", "away", "third", "fourth", "short", "long", "sleeve", "front", "back", "edition", "fc", "cf", "the", "and"])
  return new Set(
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((token) => token.length >= 3 && !ignored.has(token)),
  )
}

function mapKitRow(row: any): EditableKit {
  return rowToKit(row)
}

function rowToKit(row: any): EditableKit {
  return {
    id: Number(row.id),
    name: row.name,
    club: row.club,
    season: row.season,
    price: row.price,
    number: row.number,
    league: row.league,
    gradient: row.gradient,
    badge: row.badge,
    image: row.image,
    color: row.color,
    stock: row.stock,
    sizeStock: row.size_stock,
    backImage: row.back_image || row.image,
    description: row.description || "",
    isCustom: row.is_custom,
    isPrivate: row.is_private,
    isDraft: row.is_draft,
    isArchived: row.is_archived,
    isRemoved: row.is_removed,
  }
}

function mergeInventory(storedKits: EditableKit[]) {
  const storedById = new Map(storedKits.map((kit) => [kit.id, kit]))
  return preferLocalBaseImages([
    ...baseKits.map((kit) => {
      const stored = storedById.get(kit.id) || {}
      return kit.isDraft
        ? { ...kit, ...stored, isDraft: true, image: kit.image, backImage: kit.backImage }
        : { ...kit, ...stored }
    }),
    ...storedKits.filter((kit) => !baseKits.some((baseKit) => baseKit.id === kit.id)),
  ] as EditableKit[], baseKits)
}

function filterInventoryForScope(kits: EditableKit[], scope: string) {
  if (scope === "admin") return kits
  return kits.filter((kit) => !kit.isPrivate && !kit.isDraft && !kit.isArchived && !kit.isRemoved)
}

function kitToRow(kit: EditableKit, status: "active" | "inactive" | "draft", isRemoved: boolean) {
  const sizeStock = normalizeSizeStock(kit)
  return {
    id: kit.id,
    name: kit.name,
    club: kit.club,
    season: kit.season,
    price: kit.price,
    number: kit.number,
    league: kit.league,
    gradient: kit.gradient,
    badge: kit.badge,
    image: kit.image,
    color: kit.color,
    stock: Object.values(sizeStock).reduce((sum, value) => sum + value, 0),
    size_stock: sizeStock,
    back_image: kit.backImage || kit.image,
    description: kit.description || "",
    is_custom: !!kit.isCustom,
    is_private: status === "inactive",
    is_draft: status === "draft",
    is_archived: !!kit.isArchived,
    is_removed: isRemoved,
  }
}

function updatesToRow(updates: Partial<EditableKit> & { status?: "active" | "inactive" | "draft" }) {
  const row: Record<string, unknown> = {}
  if (updates.status) {
    row.is_private = updates.status === "inactive"
    row.is_draft = updates.status === "draft"
  }
  if (updates.isRemoved !== undefined) row.is_removed = updates.isRemoved
  if (updates.isArchived !== undefined) row.is_archived = updates.isArchived
  if (updates.price !== undefined) row.price = updates.price
  if (updates.stock !== undefined) row.stock = updates.stock
  if (updates.sizeStock !== undefined) row.size_stock = updates.sizeStock
  return row
}

function statusFromKit(kit: EditableKit): "active" | "inactive" | "draft" {
  if (kit.isDraft) return "draft"
  if (kit.isPrivate) return "inactive"
  return "active"
}

function isAdmin(request: Request) {
  return isAdminRequest(request)
}

function isMissingKitsTableError(error: { message?: string; code?: string }) {
  const message = String(error.message || "").toLowerCase()
  return error.code === "42P01" || message.includes("public.kits") || message.includes("schema cache")
}

async function syncHomepageKitImage(kit: EditableKit) {
  if (!supabaseAdmin) return

  try {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers()
    if (error) return

    const user = data.users.find((item) => item.email?.toLowerCase() === CONTENT_EMAIL)
    const content = user?.user_metadata?.homepage_content
    if (!user || !content || typeof content !== "object") return

    const homepageContent = content as Record<string, any>
    const heroSlides = Array.isArray(homepageContent.heroSlides) ? homepageContent.heroSlides : []
    let changed = false
    const nextHeroSlides = heroSlides.map((slide) => {
      if (!slide || typeof slide !== "object" || Number(slide.kitId) !== Number(kit.id)) return slide
      changed = true
      return {
        ...slide,
        src: kit.image,
        alt: kit.name,
      }
    })

    if (!changed) return

    await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        homepage_content: {
          ...homepageContent,
          heroSlides: nextHeroSlides,
        },
      },
    })
  } catch {
    // Inventory is the source of truth; homepage metadata will still resolve live on the client.
  }
}

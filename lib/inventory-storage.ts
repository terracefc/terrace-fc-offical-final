import { randomUUID } from "crypto"
import type { EditableKit } from "@/lib/inventory-client"
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin"
import { isMongoConfigured, readMongoSingleton, writeMongoSingleton } from "@/lib/mongodb"

const INVENTORY_EMAIL = "site-inventory@terracefc.local"
const INVENTORY_COLLECTION = "app_storage"
const INVENTORY_DOCUMENT = "inventory"

export async function readStoredInventory() {
  if (isMongoConfigured) {
    const stored = await readMongoSingleton<EditableKit[]>(INVENTORY_COLLECTION, INVENTORY_DOCUMENT, [])
    if (!stored.error) return { kits: normalizeKits(stored.value), error: null }
    return { kits: [] as EditableKit[], error: stored.error }
  }

  if (!isSupabaseAdminConfigured || !supabaseAdmin) {
    return { kits: [] as EditableKit[], error: "Inventory storage is not configured." }
  }

  const user = await findInventoryUser()
  return { kits: normalizeKits(user?.user_metadata?.kits), error: null }
}

export async function upsertStoredInventoryKit(kit: EditableKit) {
  const current = await readStoredInventory()
  if (current.error) return { kits: [] as EditableKit[], error: current.error }

  const kits = [
    kit,
    ...current.kits.filter((item) => item.id !== kit.id),
  ].sort((left, right) => left.id - right.id)

  const saved = await saveStoredInventory(kits)
  return { kits, error: saved.error }
}

export async function updateStoredInventoryKits(ids: number[], updates: Partial<EditableKit>) {
  const current = await readStoredInventory()
  if (current.error) return { kits: [] as EditableKit[], error: current.error }

  const byId = new Map(current.kits.map((kit) => [kit.id, kit]))
  ids.forEach((id) => {
    const existing = byId.get(id)
    if (existing) byId.set(id, { ...existing, ...updates })
  })

  const kits = Array.from(byId.values()).sort((left, right) => left.id - right.id)
  const saved = await saveStoredInventory(kits)
  return { kits, error: saved.error }
}

async function saveStoredInventory(kits: EditableKit[]) {
  if (isMongoConfigured) {
    const saved = await writeMongoSingleton(INVENTORY_COLLECTION, INVENTORY_DOCUMENT, kits)
    if (!saved.error) return { error: null }
    return { error: saved.error }
  }

  if (!isSupabaseAdminConfigured || !supabaseAdmin) {
    return { error: "Inventory storage is not configured." }
  }

  const existingUser = await findInventoryUser()
  const metadata = { kits }

  if (existingUser) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
      user_metadata: {
        ...existingUser.user_metadata,
        ...metadata,
      },
    })
    return { error: error?.message || null }
  }

  const { error } = await supabaseAdmin.auth.admin.createUser({
    email: INVENTORY_EMAIL,
    password: randomUUID(),
    email_confirm: true,
    user_metadata: metadata,
  })

  return { error: error?.message || null }
}

async function findInventoryUser() {
  if (!supabaseAdmin) return null

  const perPage = 1000
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
    if (error) return null

    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === INVENTORY_EMAIL)
    if (user) return user
    if ((data.users || []).length < perPage) break
  }

  return null
}

function normalizeKits(value: unknown) {
  if (!Array.isArray(value)) return [] as EditableKit[]
  return value.filter((kit): kit is EditableKit => {
    return !!kit && typeof kit === "object" && typeof (kit as EditableKit).id === "number"
  })
}

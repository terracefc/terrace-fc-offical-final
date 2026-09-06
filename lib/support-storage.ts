import { randomUUID } from "crypto"
import { normalizeSupportTickets, type SupportTicket } from "@/lib/support"
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin"
import { isMongoConfigured, readMongoSingleton, writeMongoSingleton } from "@/lib/mongodb"

const SUPPORT_EMAIL = "site-support@terracefc.local"
const SUPPORT_COLLECTION = "app_storage"
const SUPPORT_DOCUMENT = "support_tickets"

export async function readSupportTickets() {
  if (isMongoConfigured) {
    const stored = await readMongoSingleton<SupportTicket[]>(SUPPORT_COLLECTION, SUPPORT_DOCUMENT, [])
    if (!stored.error) return { tickets: normalizeSupportTickets(stored.value), error: null }
  }

  if (!isSupabaseAdminConfigured || !supabaseAdmin) {
    return { tickets: [] as SupportTicket[], error: "Support storage is not configured." }
  }

  const user = await findSupportUser()
  return { tickets: normalizeSupportTickets(user?.user_metadata?.support_tickets), error: null }
}

export async function saveSupportTickets(tickets: SupportTicket[]) {
  if (isMongoConfigured) {
    const sorted = tickets.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    const saved = await writeMongoSingleton(SUPPORT_COLLECTION, SUPPORT_DOCUMENT, sorted)
    if (!saved.error) return { error: null }
  }

  if (!isSupabaseAdminConfigured || !supabaseAdmin) {
    return { error: "Support storage is not configured." }
  }

  const existingUser = await findSupportUser()
  const metadata = {
    support_tickets: tickets.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()),
  }

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
    email: SUPPORT_EMAIL,
    password: randomUUID(),
    email_confirm: true,
    user_metadata: metadata,
  })

  return { error: error?.message || null }
}

async function findSupportUser() {
  if (!supabaseAdmin) return null

  const perPage = 1000
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
    if (error) return null

    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === SUPPORT_EMAIL)
    if (user) return user
    if ((data.users || []).length < perPage) break
  }

  return null
}

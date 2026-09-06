import { randomUUID } from "crypto"
import { normalizeJerseyRequests, type JerseyRequest } from "@/lib/jersey-requests"
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin"
import { isMongoConfigured, readMongoSingleton, writeMongoSingleton } from "@/lib/mongodb"

const REQUESTS_EMAIL = "site-jersey-requests@terracefc.local"
const REQUESTS_COLLECTION = "app_storage"
const REQUESTS_DOCUMENT = "jersey_requests"

export async function readJerseyRequests() {
  if (isMongoConfigured) {
    const stored = await readMongoSingleton<JerseyRequest[]>(REQUESTS_COLLECTION, REQUESTS_DOCUMENT, [])
    if (!stored.error) return { requests: normalizeJerseyRequests(stored.value), error: null }
  }

  if (!isSupabaseAdminConfigured || !supabaseAdmin) {
    return { requests: [] as JerseyRequest[], error: "Jersey request storage is not configured." }
  }

  const user = await findRequestsUser()
  return { requests: normalizeJerseyRequests(user?.user_metadata?.jersey_requests), error: null }
}

export async function saveJerseyRequests(requests: JerseyRequest[]) {
  if (isMongoConfigured) {
    const sorted = requests.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    const saved = await writeMongoSingleton(REQUESTS_COLLECTION, REQUESTS_DOCUMENT, sorted)
    if (!saved.error) return { error: null }
  }

  if (!isSupabaseAdminConfigured || !supabaseAdmin) {
    return { error: "Jersey request storage is not configured." }
  }

  const existingUser = await findRequestsUser()
  const metadata = {
    jersey_requests: requests.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()),
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
    email: REQUESTS_EMAIL,
    password: randomUUID(),
    email_confirm: true,
    user_metadata: metadata,
  })

  return { error: error?.message || null }
}

async function findRequestsUser() {
  if (!supabaseAdmin) return null

  const perPage = 1000
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
    if (error) return null

    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === REQUESTS_EMAIL)
    if (user) return user
    if ((data.users || []).length < perPage) break
  }

  return null
}

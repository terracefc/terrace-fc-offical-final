import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.sba_08338b7e2d29635e8743b3938fd5333778e65742_SUPABASE_URL || process.env.NEXT_PUBLIC_sba_08338b7e2d29635e8743b3938fd5333778e65742_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseServiceKey = process.env.sba_08338b7e2d29635e8743b3938fd5333778e65742_SUPABASE_SERVICE_ROLE_KEY || process.env.sba_08338b7e2d29635e8743b3938fd5333778e65742_SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || ""

export const isSupabaseAdminConfigured = !!(supabaseUrl && supabaseServiceKey)

export const supabaseAdmin = isSupabaseAdminConfigured
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null

export async function findSupabaseAuthUserByEmail(email: string) {
  if (!isSupabaseAdminConfigured || !supabaseAdmin) {
    return { user: null, error: "Supabase admin storage is not configured." }
  }

  const targetEmail = email.trim().toLowerCase()
  const perPage = 1000

  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })

    if (error) {
      return { user: null, error: error.message || "Supabase admin storage could not be read." }
    }

    const users = data.users || []
    const user = users.find((candidate) => candidate.email?.toLowerCase() === targetEmail)

    if (user) {
      return { user, error: null }
    }

    if (users.length < perPage) break
  }

  return { user: null, error: null }
}

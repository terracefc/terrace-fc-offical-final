import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_sba_08338b7e2d29635e8743b3938fd5333778e65742_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseAnonKey = process.env.NEXT_PUBLIC_sba_08338b7e2d29635e8743b3938fd5333778e65742_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey)

if (!isSupabaseConfigured && typeof window !== "undefined") {
  console.warn(
    "Supabase credentials are not configured in .env.local. Running in offline/localStorage fallback mode."
  )
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null as any

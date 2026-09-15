import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null | undefined

// Solo el ref del proyecto, no la URL completa: pegar un endpoint con /rest/v1 lo duplicaría
// en cada petición de supabase-js.
export function getSupabaseClient(): SupabaseClient | null {
  if (client !== undefined) return client
  const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_REF
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  client = projectRef && anonKey ? createClient(`https://${projectRef}.supabase.co`, anonKey) : null
  return client
}

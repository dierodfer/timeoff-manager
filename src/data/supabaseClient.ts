import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null | undefined

/**
 * `undefined` la primera vez: se resuelve una sola vez porque las variables de entorno no
 * cambian en caliente. `null` si faltan `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` —
 * pasa mientras no se hayan configurado en el despliegue, y quien llame debe avisar en vez
 * de dejar que `createClient` reviente con una URL vacía.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (client !== undefined) return client
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  client = url && anonKey ? createClient(url, anonKey) : null
  return client
}

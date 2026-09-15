import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null | undefined

/**
 * `undefined` la primera vez: se resuelve una sola vez porque las variables de entorno no
 * cambian en caliente. `null` si faltan `VITE_SUPABASE_PROJECT_REF`/`VITE_SUPABASE_ANON_KEY` —
 * pasa mientras no se hayan configurado en el despliegue, y quien llame debe avisar en vez
 * de dejar que `createClient` reviente con una URL vacía.
 *
 * Solo se pide el ref del proyecto (el subdominio de `<ref>.supabase.co`), no la URL
 * completa: así no hay forma de pegar por error un endpoint con `/rest/v1` o una barra
 * final, que `supabase-js` duplicaría en cada petición.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (client !== undefined) return client
  const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_REF
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  client = projectRef && anonKey ? createClient(`https://${projectRef}.supabase.co`, anonKey) : null
  return client
}

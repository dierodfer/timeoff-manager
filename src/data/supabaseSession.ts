import type { SupabaseClient } from '@supabase/supabase-js'

// Un administrador ve todas las filas de employees por RLS, no solo la suya: no se puede
// asumir cuál es "yo" sin filtrar por user_id aparte.
export async function resolveCurrentEmployeeId(client: SupabaseClient): Promise<string | null> {
  const { data: userData, error: userError } = await client.auth.getUser()
  if (userError || !userData.user) return null

  const { data, error } = await client
    .from('employees')
    .select('id')
    .eq('user_id', userData.user.id)
    .returns<{ id: string }[]>()
    .maybeSingle()
  if (error || !data) return null
  return data.id
}

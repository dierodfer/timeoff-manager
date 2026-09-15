import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Averigua qué fila de `employees` es la de quien ha iniciado sesión. No se puede leer de
 * `database.employees` sin más: un empleado normal solo ve su propia fila (RLS), pero un
 * administrador ve las de toda la empresa, así que hace falta una consulta propia filtrada
 * por `user_id` para distinguir «yo» del resto.
 */
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

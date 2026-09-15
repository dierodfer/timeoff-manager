import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActivityPeriod, Role } from '../domain/types'

export interface CrearEmpleadoInput {
  firstName: string
  lastName: string
  password: string
  role: Role
  isSeasonal: boolean
  activityPeriods: Pick<ActivityPeriod, 'start' | 'end'>[]
}

export type FunctionResult = { ok: true } | { ok: false; message: string }

/**
 * `functions.invoke()` adjunta el token de quien tiene sesión iniciada él solo: la Edge
 * Function lee el rol de la base de datos a partir de ese token, nunca de lo que viaje en el
 * cuerpo. Ver `supabase/functions/crear-empleado/index.ts`.
 */
interface ErrorBody {
  error?: string
}

async function invoke(client: SupabaseClient, name: string, body: object): Promise<FunctionResult> {
  const response = await client.functions.invoke(name, { body: body as Record<string, unknown> })
  const error = response.error as { message: string } | null
  if (error) {
    const data = response.data as ErrorBody | null
    return { ok: false, message: data?.error ?? error.message }
  }
  return { ok: true }
}

export function callCrearEmpleado(
  client: SupabaseClient,
  input: CrearEmpleadoInput,
): Promise<FunctionResult> {
  return invoke(client, 'crear-empleado', input)
}

export function callCambiarPassword(
  client: SupabaseClient,
  employeeId: string,
  password: string,
): Promise<FunctionResult> {
  return invoke(client, 'cambiar-password', { employeeId, password })
}

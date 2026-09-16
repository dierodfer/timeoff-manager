// Cambia la contraseña de OTRO empleado: solo el administrador, vía Admin API. El propio
// empleado cambia la suya con supabase.auth.updateUser({ password }), sin pasar por aquí.
//
// Desplegar con la CLI:  supabase functions deploy cambiar-password
// O pegando este fichero tal cual en el Dashboard → Edge Functions → Deploy a new function:
// la URL evita depender de deno.json, que el editor del Dashboard no admite.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Cambio {
  employeeId: string
  password: string
}

function responde(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return responde({ error: 'Método no permitido.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) return responde({ error: 'Función mal configurada.' }, 500)

  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return responde({ error: 'Falta la sesión.' }, 401)

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  const { data: quienLlama, error: errorToken } = await admin.auth.getUser(token)
  if (errorToken || !quienLlama.user) return responde({ error: 'Sesión no válida.' }, 401)

  // El rol se lee de la base de datos, nunca del token: un JWT no dice si eres administrador.
  const { data: solicitante } = await admin
    .from('employees')
    .select('id, org_id, role')
    .eq('user_id', quienLlama.user.id)
    .maybeSingle()

  if (!solicitante) return responde({ error: 'No tienes ficha de empleado.' }, 403)
  if (solicitante.role !== 'admin') {
    return responde({ error: 'Solo un administrador puede cambiar contraseñas.' }, 403)
  }

  let cambio: Cambio
  try {
    cambio = await req.json()
  } catch {
    return responde({ error: 'Cuerpo de la petición ilegible.' }, 400)
  }

  const password = cambio.password ?? ''
  if (password.length < 8 || new TextEncoder().encode(password).length > 72) {
    return responde({ error: 'La contraseña debe tener entre 8 y 72 caracteres.' }, 400)
  }

  // El objetivo tiene que ser de la misma empresa: sin esto, cualquier id valdría.
  const { data: objetivo } = await admin
    .from('employees')
    .select('user_id, org_id')
    .eq('id', cambio.employeeId)
    .maybeSingle()

  if (!objetivo || objetivo.org_id !== solicitante.org_id) {
    return responde({ error: 'No se encuentra ese empleado en tu empresa.' }, 404)
  }
  if (!objetivo.user_id) {
    return responde({ error: 'Ese empleado todavía no tiene usuario de acceso.' }, 400)
  }

  const { error: errorCambio } = await admin.auth.admin.updateUserById(objetivo.user_id, {
    password,
  })
  if (errorCambio) return responde({ error: errorCambio.message }, 400)

  return responde({ ok: true }, 200)
})

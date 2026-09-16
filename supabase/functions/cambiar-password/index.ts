// Cambia la contraseña de OTRO empleado: solo el administrador, vía Admin API. El propio
// empleado cambia la suya con supabase.auth.updateUser({ password }), sin pasar por aquí.
//
// Desplegar con la CLI:  supabase functions deploy cambiar-password
// O pegando este fichero tal cual en el Dashboard → Edge Functions → Deploy a new function:
// la URL evita depender de deno.json, que el editor del Dashboard no admite. Por el mismo
// motivo no comparte código con crear-empleado aunque autorizar() sea casi idéntica: cada
// función tiene que poder pegarse sola, sin ficheros aparte.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// authorization/content-type son del fetch; apikey/x-client-info los añade supabase-js solo:
// si el preflight no los permite, el navegador bloquea la petición antes de mandarla.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
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

type AdminClient = ReturnType<typeof createClient>

type Autorizacion =
  { ok: true; solicitante: { org_id: string } } | { ok: false; error: string; status: number }

// El rol se lee de la base de datos, nunca del token: un JWT no dice si eres administrador.
async function autorizar(admin: AdminClient, token: string): Promise<Autorizacion> {
  const { data: quienLlama, error: errorToken } = await admin.auth.getUser(token)
  if (errorToken || !quienLlama.user) return { ok: false, error: 'Sesión no válida.', status: 401 }

  const { data: solicitante, error: errorSolicitante } = await admin
    .from('employees')
    .select('org_id, role')
    .eq('user_id', quienLlama.user.id)
    .maybeSingle()

  if (errorSolicitante) {
    console.error('cambiar-password: fallo comprobando permisos:', errorSolicitante.message)
    return { ok: false, error: 'Error interno comprobando permisos.', status: 500 }
  }
  if (!solicitante) return { ok: false, error: 'No tienes ficha de empleado.', status: 403 }
  if (solicitante.role !== 'admin') {
    return { ok: false, error: 'Solo un administrador puede cambiar contraseñas.', status: 403 }
  }
  return { ok: true, solicitante }
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

  const autorizacion = await autorizar(admin, token)
  if (!autorizacion.ok) return responde({ error: autorizacion.error }, autorizacion.status)
  const { solicitante } = autorizacion

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
  const { data: objetivo, error: errorObjetivo } = await admin
    .from('employees')
    .select('user_id, org_id')
    .eq('id', cambio.employeeId)
    .maybeSingle()

  if (errorObjetivo) {
    console.error('cambiar-password: fallo consultando el objetivo:', errorObjetivo.message)
    return responde({ error: 'Error interno buscando al empleado.' }, 500)
  }
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

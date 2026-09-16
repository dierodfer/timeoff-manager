// Alta de empleados: crea el usuario de Auth y su ficha. Necesita la service_role key, que
// nunca puede viajar al navegador, así que corre aquí. Ver CLAUDE.md, «El modo empresa».
//
// Desplegar con la CLI:  supabase functions deploy crear-empleado
// O pegando este fichero tal cual en el Dashboard → Edge Functions → Deploy a new function:
// la URL evita depender de deno.json, que el editor del Dashboard no admite.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Periodo {
  start: string
  end: string | null
}

interface Alta {
  firstName: string
  lastName?: string
  password: string
  role?: 'admin' | 'employee'
  isSeasonal?: boolean
  activityPeriods?: Periodo[]
}

function responde(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

type AdminClient = ReturnType<typeof createClient>

type Autorizacion =
  | { ok: true; solicitante: { id: string; org_id: string; role: string } }
  | { ok: false; error: string; status: number }

// El rol se lee de la base de datos, nunca del token: un JWT no dice si eres administrador.
async function autorizar(admin: AdminClient, token: string): Promise<Autorizacion> {
  const { data: quienLlama, error: errorToken } = await admin.auth.getUser(token)
  if (errorToken || !quienLlama.user) return { ok: false, error: 'Sesión no válida.', status: 401 }

  const { data: solicitante } = await admin
    .from('employees')
    .select('id, org_id, role')
    .eq('user_id', quienLlama.user.id)
    .maybeSingle()

  if (!solicitante) return { ok: false, error: 'No tienes ficha de empleado.', status: 403 }
  if (solicitante.role !== 'admin') {
    return { ok: false, error: 'Solo un administrador puede dar de alta.', status: 403 }
  }
  return { ok: true, solicitante }
}

// Email interno: nadie lo teclea ni recibe correo en él. Se desambigua con la hora.
function derivarEmail(firstName: string, lastName: string, slug: string): string {
  const base = `${firstName} ${lastName}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '')
  return `${base}.${Date.now().toString(36)}@${slug}.local`
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

  let alta: Alta
  try {
    alta = await req.json()
  } catch {
    return responde({ error: 'Cuerpo de la petición ilegible.' }, 400)
  }

  const firstName = alta.firstName?.trim()
  const lastName = alta.lastName?.trim() ?? ''
  if (!firstName) return responde({ error: 'Falta el nombre.' }, 400)

  // Mínimo real de Supabase Auth: 6 (sube en silencio cualquier valor menor); aquí se pide 8.
  // El tope de 72 es de bcrypt, en bytes UTF-8.
  const password = alta.password ?? ''
  if (password.length < 8 || new TextEncoder().encode(password).length > 72) {
    return responde({ error: 'La contraseña debe tener entre 8 y 72 caracteres.' }, 400)
  }

  const { data: empresa } = await admin
    .from('organizations')
    .select('slug')
    .eq('id', solicitante.org_id)
    .single()

  if (!empresa) return responde({ error: 'No se encuentra la empresa.' }, 500)

  const email = derivarEmail(firstName, lastName, empresa.slug)

  const { data: creado, error: errorAlta } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (errorAlta || !creado.user) {
    return responde({ error: errorAlta?.message ?? 'No se pudo crear el usuario.' }, 400)
  }

  const { data: ficha, error: errorFicha } = await admin
    .from('employees')
    .insert({
      org_id: solicitante.org_id,
      user_id: creado.user.id,
      email,
      first_name: firstName,
      last_name: lastName,
      role: alta.role ?? 'employee',
      is_seasonal: alta.isSeasonal ?? false,
    })
    .select('id')
    .single()

  // Si la ficha falla, el usuario de auth se queda huérfano y bloquearía el email.
  if (errorFicha || !ficha) {
    await admin.auth.admin.deleteUser(creado.user.id)
    return responde({ error: errorFicha?.message ?? 'No se pudo crear la ficha.' }, 400)
  }

  const periodos =
    alta.activityPeriods && alta.activityPeriods.length > 0
      ? alta.activityPeriods
      : [{ start: new Date().toISOString().slice(0, 10), end: null }]

  // Un solo insert con todas las filas: si el constraint rechaza cualquiera, no escribe ninguna.
  const { error: errorPeriodo } = await admin.from('activity_periods').insert(
    periodos.map((periodo) => ({
      employee_id: ficha.id,
      start_date: periodo.start,
      end_date: periodo.end,
    })),
  )
  if (errorPeriodo) {
    await admin.from('employees').delete().eq('id', ficha.id)
    await admin.auth.admin.deleteUser(creado.user.id)
    return responde({ error: errorPeriodo.message }, 400)
  }

  return responde({ employeeId: ficha.id, email }, 201)
})

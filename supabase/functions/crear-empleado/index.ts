// Alta de empleados: crea el usuario de Supabase Auth y su ficha, de una vez.
//
// Existe porque crear un usuario exige la Admin API, y la Admin API exige la
// service_role key, que se salta RLS entera y por tanto NUNCA puede viajar al
// navegador (el bundle de GitHub Pages es público). Aquí sí: esto corre en el
// servidor de Supabase y la clave es una variable de entorno de la función.
//
// Desplegar con:  supabase functions deploy crear-empleado
import { createClient } from '@supabase/supabase-js'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Alta {
  firstName: string
  lastName?: string
  pin: string
  role?: 'admin' | 'employee'
  isSeasonal?: boolean
  startDate?: string
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

  // Con la clave de servicio, pero preguntando por el dueño de ESE token: así
  // sabemos quién llama sin fiarnos de nada que venga en el cuerpo.
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  const { data: quienLlama, error: errorToken } = await admin.auth.getUser(token)
  if (errorToken || !quienLlama.user) return responde({ error: 'Sesión no válida.' }, 401)

  // El rol se lee de la base de datos, nunca del token: un JWT no dice si eres
  // administrador de esta aplicación.
  const { data: solicitante } = await admin
    .from('employees')
    .select('id, org_id, role')
    .eq('user_id', quienLlama.user.id)
    .maybeSingle()

  if (!solicitante) return responde({ error: 'No tienes ficha de empleado.' }, 403)
  if (solicitante.role !== 'admin') {
    return responde({ error: 'Solo un administrador puede dar de alta.' }, 403)
  }

  let alta: Alta
  try {
    alta = await req.json()
  } catch {
    return responde({ error: 'Cuerpo de la petición ilegible.' }, 400)
  }

  const firstName = alta.firstName?.trim()
  const lastName = alta.lastName?.trim() ?? ''
  if (!firstName) return responde({ error: 'Falta el nombre.' }, 400)

  // Supabase Auth impone un mínimo de 6 caracteres para la contraseña: está en
  // su código (defaultMinPasswordLength = 6) y sube cualquier valor menor, así
  // que el PIN no puede ser de 4 dígitos aunque lo configures en el panel.
  if (!/^\d{6,8}$/.test(alta.pin ?? '')) {
    return responde({ error: 'El PIN debe tener entre 6 y 8 dígitos.' }, 400)
  }

  const { data: empresa } = await admin
    .from('organizations')
    .select('slug')
    .eq('id', solicitante.org_id)
    .single()

  if (!empresa) return responde({ error: 'No se encuentra la empresa.' }, 500)

  // Email interno: nadie lo teclea ni recibe correo en él, solo identifica al
  // usuario ante Supabase Auth. Se deriva del nombre y se desambigua con la
  // hora, para que dos «Luis Peón» no choquen.
  const base = `${firstName} ${lastName}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '')
  const email = `${base}.${Date.now().toString(36)}@${empresa.slug}.local`

  const { data: creado, error: errorAlta } = await admin.auth.admin.createUser({
    email,
    password: alta.pin,
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

  // Si la ficha falla, el usuario de auth se queda huérfano y bloquearía el
  // email: se deshace antes de responder.
  if (errorFicha || !ficha) {
    await admin.auth.admin.deleteUser(creado.user.id)
    return responde({ error: errorFicha?.message ?? 'No se pudo crear la ficha.' }, 400)
  }

  const { error: errorPeriodo } = await admin.from('activity_periods').insert({
    employee_id: ficha.id,
    start_date: alta.startDate ?? new Date().toISOString().slice(0, 10),
  })
  if (errorPeriodo) {
    await admin.from('employees').delete().eq('id', ficha.id)
    await admin.auth.admin.deleteUser(creado.user.id)
    return responde({ error: errorPeriodo.message }, 400)
  }

  return responde({ employeeId: ficha.id, email }, 201)
})

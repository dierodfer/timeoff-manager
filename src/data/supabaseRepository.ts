import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../domain/types'
import { diffDatabase, type DatabaseDiff } from './diffDatabase'
import { ConcurrencyError, type VacationRepository } from './repository'
import {
  activityPeriodToRow,
  allowanceToRow,
  commentToRow,
  databaseFromRows,
  employeeToRow,
  holidayToRow,
  requestDayToRow,
  requestToRow,
  settingsToRow,
  type ActivityPeriodRow,
  type AllowanceRow,
  type EmployeeRow,
  type HolidayRow,
  type OrganizationRow,
  type RequestCommentRow,
  type VacationRequestDayRow,
  type VacationRequestRow,
} from './supabaseMappers'

const ORGANIZATION_COLUMNS = 'id, name, default_annual_days, workweek, version'
const EMPLOYEE_COLUMNS = 'id, email, first_name, last_name, role, is_seasonal'
const ACTIVITY_PERIOD_COLUMNS = 'id, employee_id, start_date, end_date'
const HOLIDAY_COLUMNS = 'id, day, name, scope'
const ALLOWANCE_COLUMNS = 'employee_id, year, days'
const REQUEST_COLUMNS =
  'id, employee_id, year, status, created_by, created_at, resolved_by, resolved_at, batch_id'
const REQUEST_DAY_COLUMNS = 'request_id, day'
const COMMENT_COLUMNS = 'id, request_id, author_id, author_name, body, created_at'

// Igual al db-max-rows por defecto de un proyecto de Supabase (Settings → API): PostgREST nunca
// devuelve más filas que eso de golpe, aunque no se pida .range(). Si el proyecto lo tiene bajado
// a menos de 1000, hay que bajar esto también — subirlo en el panel no rompe nada, este valor solo
// decide en cuántas páginas se pide.
const PAGE_SIZE = 1000

/** Trae una tabla entera paginando con .range(): sin esto, una tabla que ya supere PAGE_SIZE (la
 * más expuesta es vacation_request_days, que crece con cada día de cada solicitud de cada año) se
 * cargaría truncada — y un guardado posterior que tocara una fila fuera de esa página la borraría
 * sin querer, porque activity_periods/vacation_request_days se reescriben por sustitución
 * completa (ver diffDatabase()). */
async function fetchAll<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < PAGE_SIZE) break
  }
  return rows
}

async function loadFull(
  client: SupabaseClient,
): Promise<{ database: Database; orgId: string; orgVersion: number }> {
  const [
    organization,
    employees,
    activityPeriods,
    holidays,
    allowances,
    requests,
    requestDays,
    comments,
  ] = await Promise.all([
    client.from('organizations').select(ORGANIZATION_COLUMNS).returns<OrganizationRow[]>(),
    fetchAll<EmployeeRow>((from, to) =>
      client.from('employees').select(EMPLOYEE_COLUMNS).range(from, to).returns<EmployeeRow[]>(),
    ),
    fetchAll<ActivityPeriodRow>((from, to) =>
      client
        .from('activity_periods')
        .select(ACTIVITY_PERIOD_COLUMNS)
        .range(from, to)
        .returns<ActivityPeriodRow[]>(),
    ),
    fetchAll<HolidayRow>((from, to) =>
      client.from('holidays').select(HOLIDAY_COLUMNS).range(from, to).returns<HolidayRow[]>(),
    ),
    fetchAll<AllowanceRow>((from, to) =>
      client.from('allowances').select(ALLOWANCE_COLUMNS).range(from, to).returns<AllowanceRow[]>(),
    ),
    fetchAll<VacationRequestRow>((from, to) =>
      client
        .from('vacation_requests')
        .select(REQUEST_COLUMNS)
        .range(from, to)
        .returns<VacationRequestRow[]>(),
    ),
    fetchAll<VacationRequestDayRow>((from, to) =>
      client
        .from('vacation_request_days')
        .select(REQUEST_DAY_COLUMNS)
        .range(from, to)
        .returns<VacationRequestDayRow[]>(),
    ),
    fetchAll<RequestCommentRow>((from, to) =>
      client
        .from('request_comments')
        .select(COMMENT_COLUMNS)
        .range(from, to)
        .returns<RequestCommentRow[]>(),
    ),
  ])

  if (organization.error) throw organization.error
  const organizationRow = organization.data?.[0]
  if (!organizationRow) throw new Error('No se encuentra la empresa de esta sesión.')

  const database = databaseFromRows({
    organization: organizationRow,
    employees,
    activityPeriods,
    holidays,
    allowances,
    requests,
    requestDays,
    comments,
  })
  return { database, orgId: organizationRow.id, orgVersion: organizationRow.version }
}

/** Reserva el bloqueo optimista antes de escribir nada: ver bump_org_version() en schema.sql. Si
 * `expected` ya no coincide con lo guardado, lanza ConcurrencyError en vez de devolver la versión
 * nueva, para que save() aborte el resto del guardado sin tocar ninguna tabla. */
async function bumpVersion(client: SupabaseClient, expected: number): Promise<number> {
  // Anotación explícita en vez de .returns(): esta RPC devuelve un bigint suelto, no una fila,
  // y .returns() solo sabe tipar resultados con forma de tabla (mismo patrón que
  // perfiles_para_acceso() en CompanyGate.tsx).
  const response: { data: number | null; error: PostgrestError | null } = await client.rpc(
    'bump_org_version',
    { p_expected: expected },
  )
  if (response.error) throw response.error
  if (response.data === null) throw new ConcurrencyError()
  return response.data
}

async function writeSettings(
  client: SupabaseClient,
  org: string,
  settings: DatabaseDiff['settings'],
): Promise<void> {
  if (!settings) return
  const { error } = await client.from('organizations').update(settingsToRow(settings)).eq('id', org)
  if (error) throw error
}

async function writeEmployeeUpdates(
  client: SupabaseClient,
  employees: DatabaseDiff['employees']['update'],
): Promise<void> {
  for (const employee of employees) {
    const { error } = await client
      .from('employees')
      .update(employeeToRow(employee))
      .eq('id', employee.id)
    if (error) throw error
  }
}

// Sustituye el conjunto entero en vez de diferenciar fila a fila: ver diffDatabase().
async function writeActivityPeriods(
  client: SupabaseClient,
  employeeIds: string[],
  next: Database,
): Promise<void> {
  for (const employeeId of employeeIds) {
    const { error: deleteError } = await client
      .from('activity_periods')
      .delete()
      .eq('employee_id', employeeId)
    if (deleteError) throw deleteError

    const periods = next.employees.find((item) => item.id === employeeId)?.activityPeriods ?? []
    if (periods.length === 0) continue
    const { error: insertError } = await client
      .from('activity_periods')
      .insert(periods.map((period) => activityPeriodToRow(employeeId, period)))
    if (insertError) throw insertError
  }
}

async function writeHolidays(
  client: SupabaseClient,
  org: string,
  holidays: DatabaseDiff['holidays'],
): Promise<void> {
  if (holidays.insert.length > 0) {
    const { error } = await client
      .from('holidays')
      .insert(holidays.insert.map((holiday) => holidayToRow(org, holiday)))
    if (error) throw error
  }
  for (const holiday of holidays.update) {
    const { error } = await client
      .from('holidays')
      .update(holidayToRow(org, holiday))
      .eq('id', holiday.id)
    if (error) throw error
  }
  if (holidays.delete.length > 0) {
    const { error } = await client.from('holidays').delete().in('id', holidays.delete)
    if (error) throw error
  }
}

async function writeAllowances(
  client: SupabaseClient,
  allowances: DatabaseDiff['allowances'],
): Promise<void> {
  if (allowances.upsert.length > 0) {
    const { error } = await client
      .from('allowances')
      .upsert(allowances.upsert.map(allowanceToRow), { onConflict: 'employee_id,year' })
    if (error) throw error
  }
  for (const key of allowances.delete) {
    const { error } = await client
      .from('allowances')
      .delete()
      .eq('employee_id', key.employeeId)
      .eq('year', key.year)
    if (error) throw error
  }
}

async function writeRequests(
  client: SupabaseClient,
  requests: DatabaseDiff['requests'],
): Promise<void> {
  if (requests.insert.length > 0) {
    const { error } = await client
      .from('vacation_requests')
      .insert(requests.insert.map(requestToRow))
    if (error) throw error
  }
  for (const request of requests.update) {
    const { error } = await client
      .from('vacation_requests')
      .update(requestToRow(request))
      .eq('id', request.id)
    if (error) throw error
  }
}

// Sustituye el conjunto entero en vez de diferenciar fila a fila: ver diffDatabase().
async function writeRequestDays(
  client: SupabaseClient,
  requestIds: string[],
  next: Database,
): Promise<void> {
  for (const requestId of requestIds) {
    const { error: deleteError } = await client
      .from('vacation_request_days')
      .delete()
      .eq('request_id', requestId)
    if (deleteError) throw deleteError

    const days = next.requests.find((item) => item.id === requestId)?.days ?? []
    if (days.length === 0) continue
    const { error: insertError } = await client
      .from('vacation_request_days')
      .insert(days.map((day) => requestDayToRow(requestId, day)))
    if (insertError) throw insertError
  }
}

async function writeComments(
  client: SupabaseClient,
  comments: DatabaseDiff['comments'],
): Promise<void> {
  if (comments.insert.length === 0) return
  const { error } = await client
    .from('request_comments')
    .insert(comments.insert.map(({ requestId, comment }) => commentToRow(requestId, comment)))
  if (error) throw error
}

// Al final: sus cascadas no deben llevarse filas que los pasos de arriba acaban de escribir.
async function deleteRequestsAndEmployees(
  client: SupabaseClient,
  requests: DatabaseDiff['requests'],
  employees: DatabaseDiff['employees'],
): Promise<void> {
  if (requests.delete.length > 0) {
    const { error } = await client.from('vacation_requests').delete().in('id', requests.delete)
    if (error) throw error
  }
  if (employees.delete.length > 0) {
    const { error } = await client.from('employees').delete().in('id', employees.delete)
    if (error) throw error
  }
}

async function applyDiff(
  client: SupabaseClient,
  org: string,
  diff: DatabaseDiff,
  next: Database,
): Promise<void> {
  await writeSettings(client, org, diff.settings)
  await writeEmployeeUpdates(client, diff.employees.update)
  await writeActivityPeriods(client, diff.activityPeriods.replaceFor, next)
  await writeHolidays(client, org, diff.holidays)
  await writeAllowances(client, diff.allowances)
  await writeRequests(client, diff.requests)
  await writeRequestDays(client, diff.requestDays.replaceFor, next)
  await writeComments(client, diff.comments)
  await deleteRequestsAndEmployees(client, diff.requests, diff.employees)
}

/** `VacationRepository` contra Supabase. Ver CLAUDE.md, «El modo empresa». */
export function createSupabaseRepository(client: SupabaseClient): VacationRepository {
  let orgId: string | null = null
  let orgVersion: number | null = null
  let lastKnown: Database | null = null
  // Cadena de escrituras: dos save() seguidos no pueden solapar sus diffs. El .catch() la
  // mantiene viva tras un fallo; quien llamó sigue viendo el rechazo vía `run`.
  let queue: Promise<unknown> = Promise.resolve()

  return {
    async load() {
      const { database, orgId: loadedOrgId, orgVersion: loadedVersion } = await loadFull(client)
      lastKnown = database
      orgId = loadedOrgId
      orgVersion = loadedVersion
      return database
    },

    save(next: Database) {
      const run = queue.then(async () => {
        const previous = lastKnown
        const org = orgId
        const version = orgVersion
        if (!previous || !org || version === null) {
          throw new Error('No se ha cargado la base de datos todavía.')
        }
        // Bloqueo optimista: si otro guardado se adelantó desde el último load(), esto lanza
        // ConcurrencyError antes de escribir ninguna tabla. AppStore.tsx resincroniza al
        // capturarla, igual que ante cualquier otro fallo de guardado.
        orgVersion = await bumpVersion(client, version)
        await applyDiff(client, org, diffDatabase(previous, next), next)
        lastKnown = next
      })
      queue = run.catch(() => {})
      return run
    },

    clear() {
      return Promise.reject(new Error('El modo empresa no borra la empresa desde la aplicación.'))
    },
  } satisfies VacationRepository
}

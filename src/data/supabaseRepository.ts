import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../domain/types'
import { diffDatabase, type DatabaseDiff } from './diffDatabase'
import type { VacationRepository } from './repository'
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

const ORGANIZATION_COLUMNS = 'id, name, default_annual_days, workweek'
const EMPLOYEE_COLUMNS = 'id, email, first_name, last_name, role, is_seasonal'
const ACTIVITY_PERIOD_COLUMNS = 'id, employee_id, start_date, end_date'
const HOLIDAY_COLUMNS = 'id, day, name, scope'
const ALLOWANCE_COLUMNS = 'employee_id, year, days'
const REQUEST_COLUMNS =
  'id, employee_id, year, status, created_by, created_at, resolved_by, resolved_at, batch_id'
const REQUEST_DAY_COLUMNS = 'request_id, day'
const COMMENT_COLUMNS = 'id, request_id, author_id, author_name, body, created_at'

async function loadFull(client: SupabaseClient): Promise<{ database: Database; orgId: string }> {
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
    client.from('employees').select(EMPLOYEE_COLUMNS).returns<EmployeeRow[]>(),
    client.from('activity_periods').select(ACTIVITY_PERIOD_COLUMNS).returns<ActivityPeriodRow[]>(),
    client.from('holidays').select(HOLIDAY_COLUMNS).returns<HolidayRow[]>(),
    client.from('allowances').select(ALLOWANCE_COLUMNS).returns<AllowanceRow[]>(),
    client.from('vacation_requests').select(REQUEST_COLUMNS).returns<VacationRequestRow[]>(),
    client
      .from('vacation_request_days')
      .select(REQUEST_DAY_COLUMNS)
      .returns<VacationRequestDayRow[]>(),
    client.from('request_comments').select(COMMENT_COLUMNS).returns<RequestCommentRow[]>(),
  ])

  for (const result of [
    organization,
    employees,
    activityPeriods,
    holidays,
    allowances,
    requests,
    requestDays,
    comments,
  ]) {
    if (result.error) throw result.error
  }
  const organizationRow = organization.data?.[0]
  if (!organizationRow) throw new Error('No se encuentra la empresa de esta sesión.')

  const database = databaseFromRows({
    organization: organizationRow,
    employees: employees.data ?? [],
    activityPeriods: activityPeriods.data ?? [],
    holidays: holidays.data ?? [],
    allowances: allowances.data ?? [],
    requests: requests.data ?? [],
    requestDays: requestDays.data ?? [],
    comments: comments.data ?? [],
  })
  return { database, orgId: organizationRow.id }
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

// Al final: sus cascadas no deben llevarse por delante filas que los pasos de arriba acaban de
// escribir en la misma operación.
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

/**
 * `VacationRepository` contra Supabase: cada `load()` trae la empresa entera (RLS decide qué
 * filas ve cada rol, no filtros aquí) y cada `save()` diferencia contra la última instantánea
 * conocida con `diffDatabase()`, escribiendo solo lo que cambió. Es la implementación de la
 * arquitectura «instantánea + diff»: `state/actions.ts` sigue viendo un único `Database` en
 * memoria, igual que en modo local.
 */
export function createSupabaseRepository(client: SupabaseClient): VacationRepository {
  let orgId: string | null = null
  let lastKnown: Database | null = null
  // Cadena de escrituras: dos save() seguidos no pueden solapar sus diffs sobre la misma base.
  // Sigue viva pase lo que pase (el .catch() la traga) para que un fallo no bloquee la
  // siguiente escritura; el rechazo real lo ve igualmente quien llamó a esa escritura en
  // concreto, vía `run`.
  let queue: Promise<unknown> = Promise.resolve()

  return {
    async load() {
      const { database, orgId: loadedOrgId } = await loadFull(client)
      lastKnown = database
      orgId = loadedOrgId
      return database
    },

    save(next: Database) {
      const run = queue.then(async () => {
        const previous = lastKnown
        const org = orgId
        if (!previous || !org) throw new Error('No se ha cargado la base de datos todavía.')
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

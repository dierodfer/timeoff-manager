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

  async function loadFull(): Promise<Database> {
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
      client
        .from('activity_periods')
        .select(ACTIVITY_PERIOD_COLUMNS)
        .returns<ActivityPeriodRow[]>(),
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

    orgId = organizationRow.id
    return databaseFromRows({
      organization: organizationRow,
      employees: employees.data ?? [],
      activityPeriods: activityPeriods.data ?? [],
      holidays: holidays.data ?? [],
      allowances: allowances.data ?? [],
      requests: requests.data ?? [],
      requestDays: requestDays.data ?? [],
      comments: comments.data ?? [],
    })
  }

  async function applyDiff(diff: DatabaseDiff, next: Database, org: string): Promise<void> {
    if (diff.settings) {
      const { error } = await client
        .from('organizations')
        .update(settingsToRow(diff.settings))
        .eq('id', org)
      if (error) throw error
    }

    for (const employee of diff.employees.update) {
      const { error } = await client
        .from('employees')
        .update(employeeToRow(employee))
        .eq('id', employee.id)
      if (error) throw error
    }

    // Sustituye el conjunto entero en vez de diferenciar fila a fila: ver diffDatabase().
    for (const employeeId of diff.activityPeriods.replaceFor) {
      const { error: deleteError } = await client
        .from('activity_periods')
        .delete()
        .eq('employee_id', employeeId)
      if (deleteError) throw deleteError
      const periods = next.employees.find((item) => item.id === employeeId)?.activityPeriods ?? []
      if (periods.length > 0) {
        const { error: insertError } = await client
          .from('activity_periods')
          .insert(periods.map((period) => activityPeriodToRow(employeeId, period)))
        if (insertError) throw insertError
      }
    }

    if (diff.holidays.insert.length > 0) {
      const { error } = await client
        .from('holidays')
        .insert(diff.holidays.insert.map((holiday) => holidayToRow(org, holiday)))
      if (error) throw error
    }
    for (const holiday of diff.holidays.update) {
      const { error } = await client
        .from('holidays')
        .update(holidayToRow(org, holiday))
        .eq('id', holiday.id)
      if (error) throw error
    }
    if (diff.holidays.delete.length > 0) {
      const { error } = await client.from('holidays').delete().in('id', diff.holidays.delete)
      if (error) throw error
    }

    if (diff.allowances.upsert.length > 0) {
      const { error } = await client
        .from('allowances')
        .upsert(diff.allowances.upsert.map(allowanceToRow), { onConflict: 'employee_id,year' })
      if (error) throw error
    }
    for (const key of diff.allowances.delete) {
      const { error } = await client
        .from('allowances')
        .delete()
        .eq('employee_id', key.employeeId)
        .eq('year', key.year)
      if (error) throw error
    }

    if (diff.requests.insert.length > 0) {
      const { error } = await client
        .from('vacation_requests')
        .insert(diff.requests.insert.map(requestToRow))
      if (error) throw error
    }
    for (const request of diff.requests.update) {
      const { error } = await client
        .from('vacation_requests')
        .update(requestToRow(request))
        .eq('id', request.id)
      if (error) throw error
    }

    // Sustituye el conjunto entero en vez de diferenciar fila a fila: ver diffDatabase().
    for (const requestId of diff.requestDays.replaceFor) {
      const { error: deleteError } = await client
        .from('vacation_request_days')
        .delete()
        .eq('request_id', requestId)
      if (deleteError) throw deleteError
      const days = next.requests.find((item) => item.id === requestId)?.days ?? []
      if (days.length > 0) {
        const { error: insertError } = await client
          .from('vacation_request_days')
          .insert(days.map((day) => requestDayToRow(requestId, day)))
        if (insertError) throw insertError
      }
    }

    if (diff.comments.insert.length > 0) {
      const { error } = await client
        .from('request_comments')
        .insert(
          diff.comments.insert.map(({ requestId, comment }) => commentToRow(requestId, comment)),
        )
      if (error) throw error
    }

    // Las solicitudes y los empleados se borran al final: sus cascadas no deben llevarse por
    // delante filas que los pasos de arriba acaban de escribir en la misma operación.
    if (diff.requests.delete.length > 0) {
      const { error } = await client
        .from('vacation_requests')
        .delete()
        .in('id', diff.requests.delete)
      if (error) throw error
    }
    if (diff.employees.delete.length > 0) {
      const { error } = await client.from('employees').delete().in('id', diff.employees.delete)
      if (error) throw error
    }
  }

  return {
    async load() {
      const database = await loadFull()
      lastKnown = database
      return database
    },

    save(next: Database) {
      const run = queue.then(async () => {
        const previous = lastKnown
        const org = orgId
        if (!previous || !org) throw new Error('No se ha cargado la base de datos todavía.')
        await applyDiff(diffDatabase(previous, next), next, org)
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

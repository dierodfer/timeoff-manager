import type {
  Allowance,
  Database,
  Employee,
  Holiday,
  RequestComment,
  Settings,
  VacationRequest,
} from '../domain/types'

// Filas tal como las devuelve PostgREST (snake_case). `supabase/schema.sql` es la fuente de
// verdad del esquema completo.

export interface OrganizationRow {
  id: string
  name: string
  default_annual_days: number
  workweek: number[]
}

export interface EmployeeRow {
  id: string
  email: string | null
  first_name: string
  last_name: string
  role: 'admin' | 'employee'
  is_seasonal: boolean
}

export interface ActivityPeriodRow {
  id: string
  employee_id: string
  start_date: string
  end_date: string | null
}

export interface HolidayRow {
  id: string
  day: string
  name: string
  scope: Holiday['scope']
}

export interface AllowanceRow {
  employee_id: string
  year: number
  days: number
}

export interface VacationRequestRow {
  id: string
  employee_id: string
  year: number
  status: VacationRequest['status']
  created_by: string | null
  created_at: string
  resolved_by: string | null
  resolved_at: string | null
  batch_id: string | null
}

export interface VacationRequestDayRow {
  request_id: string
  day: string
}

export interface RequestCommentRow {
  id: string
  request_id: string
  author_id: string | null
  author_name: string
  body: string
  created_at: string
}

export function settingsFromRow(row: OrganizationRow): Settings {
  return {
    organizationName: row.name,
    defaultAnnualDays: Number(row.default_annual_days),
    workweek: row.workweek,
  }
}

export function settingsToRow(settings: Settings) {
  return {
    name: settings.organizationName,
    default_annual_days: settings.defaultAnnualDays,
    workweek: settings.workweek,
  }
}

// pinHash/pinSalt no existen en Supabase (la identidad la lleva Auth); vacíos, nada los lee aquí.
export function employeeFromRow(row: EmployeeRow, activityPeriods: ActivityPeriodRow[]): Employee {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
    isSeasonal: row.is_seasonal,
    activityPeriods: activityPeriods.map(activityPeriodFromRow),
    pinHash: '',
    pinSalt: '',
    createdAt: '',
  }
}

export function employeeToRow(employee: Employee) {
  return {
    first_name: employee.firstName,
    last_name: employee.lastName,
    role: employee.role,
    is_seasonal: employee.isSeasonal,
  }
}

export function activityPeriodFromRow(row: ActivityPeriodRow) {
  return { id: row.id, start: row.start_date, end: row.end_date }
}

export function activityPeriodToRow(
  employeeId: string,
  period: Employee['activityPeriods'][number],
) {
  return { id: period.id, employee_id: employeeId, start_date: period.start, end_date: period.end }
}

export function holidayFromRow(row: HolidayRow): Holiday {
  return { id: row.id, date: row.day, name: row.name, scope: row.scope }
}

export function holidayToRow(orgId: string, holiday: Holiday) {
  return {
    id: holiday.id,
    org_id: orgId,
    day: holiday.date,
    name: holiday.name,
    scope: holiday.scope,
  }
}

export function allowanceFromRow(row: AllowanceRow): Allowance {
  return { employeeId: row.employee_id, year: row.year, days: Number(row.days) }
}

export function allowanceToRow(allowance: Allowance) {
  return { employee_id: allowance.employeeId, year: allowance.year, days: allowance.days }
}

export function requestFromRow(
  row: VacationRequestRow,
  days: string[],
  comments: RequestComment[],
): VacationRequest {
  return {
    id: row.id,
    employeeId: row.employee_id,
    year: row.year,
    days,
    status: row.status,
    createdBy: row.created_by ?? '',
    createdAt: row.created_at,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
    comments,
    batchId: row.batch_id,
  }
}

export function requestToRow(request: VacationRequest) {
  return {
    id: request.id,
    employee_id: request.employeeId,
    year: request.year,
    status: request.status,
    created_by: request.createdBy || null,
    created_at: request.createdAt,
    resolved_by: request.resolvedBy,
    resolved_at: request.resolvedAt,
    batch_id: request.batchId,
  }
}

export function requestDayToRow(requestId: string, day: string): VacationRequestDayRow {
  return { request_id: requestId, day }
}

export function commentFromRow(row: RequestCommentRow): RequestComment {
  return {
    id: row.id,
    authorId: row.author_id ?? '',
    authorName: row.author_name,
    text: row.body,
    createdAt: row.created_at,
  }
}

export function commentToRow(requestId: string, comment: RequestComment) {
  return {
    id: comment.id,
    request_id: requestId,
    author_id: comment.authorId || null,
    author_name: comment.authorName,
    body: comment.text,
    created_at: comment.createdAt,
  }
}

export interface LoadedRows {
  organization: OrganizationRow
  employees: EmployeeRow[]
  activityPeriods: ActivityPeriodRow[]
  holidays: HolidayRow[]
  allowances: AllowanceRow[]
  requests: VacationRequestRow[]
  requestDays: VacationRequestDayRow[]
  comments: RequestCommentRow[]
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>()
  for (const item of items) {
    const list = map.get(key(item))
    if (list) list.push(item)
    else map.set(key(item), [item])
  }
  return map
}

/** Ensambla el `Database` con la misma forma que usa el modo local a partir de las ocho tablas. */
export function databaseFromRows(rows: LoadedRows): Database {
  const periodsByEmployee = groupBy(rows.activityPeriods, (period) => period.employee_id)
  const daysByRequest = groupBy(rows.requestDays, (day) => day.request_id)
  const commentsByRequest = groupBy(rows.comments, (comment) => comment.request_id)

  return {
    settings: settingsFromRow(rows.organization),
    employees: rows.employees.map((row) =>
      employeeFromRow(row, periodsByEmployee.get(row.id) ?? []),
    ),
    holidays: rows.holidays.map(holidayFromRow),
    allowances: rows.allowances.map(allowanceFromRow),
    requests: rows.requests.map((row) =>
      requestFromRow(
        row,
        (daysByRequest.get(row.id) ?? []).map((item) => item.day),
        (commentsByRequest.get(row.id) ?? []).map(commentFromRow),
      ),
    ),
  }
}

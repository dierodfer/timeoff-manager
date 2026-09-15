import type {
  Allowance,
  Database,
  Employee,
  Holiday,
  RequestComment,
  Settings,
  VacationRequest,
} from '../domain/types'

export interface DatabaseDiff {
  settings: Settings | null
  employees: { update: Employee[]; delete: string[] }
  activityPeriods: { replaceFor: string[] }
  holidays: { insert: Holiday[]; update: Holiday[]; delete: string[] }
  allowances: { upsert: Allowance[]; delete: { employeeId: string; year: number }[] }
  requests: { insert: VacationRequest[]; update: VacationRequest[]; delete: string[] }
  requestDays: { replaceFor: string[] }
  comments: { insert: { requestId: string; comment: RequestComment }[] }
}

function settingsEqual(a: Settings, b: Settings): boolean {
  return (
    a.organizationName === b.organizationName &&
    a.defaultAnnualDays === b.defaultAnnualDays &&
    a.workweek.length === b.workweek.length &&
    a.workweek.every((day, index) => day === b.workweek[index])
  )
}

function employeeColumnsEqual(a: Employee, b: Employee): boolean {
  return (
    a.firstName === b.firstName &&
    a.lastName === b.lastName &&
    a.role === b.role &&
    a.isSeasonal === b.isSeasonal
  )
}

// Compara los periodos de actividad como conjunto, no como lista: cerrar un periodo en curso
// (terminateEmployee) le cambia el `end` conservando el mismo id, así que el orden no importa,
// solo qué ids hay y qué start/end tiene cada uno.
function periodsEqual(a: Employee['activityPeriods'], b: Employee['activityPeriods']): boolean {
  if (a.length !== b.length) return false
  const byId = new Map(a.map((period) => [period.id, period]))
  return b.every((period) => {
    const previous = byId.get(period.id)
    return previous !== undefined && previous.start === period.start && previous.end === period.end
  })
}

function holidayColumnsEqual(a: Holiday, b: Holiday): boolean {
  return a.date === b.date && a.name === b.name && a.scope === b.scope
}

function requestColumnsEqual(a: VacationRequest, b: VacationRequest): boolean {
  return (
    a.employeeId === b.employeeId &&
    a.year === b.year &&
    a.status === b.status &&
    a.createdBy === b.createdBy &&
    a.createdAt === b.createdAt &&
    a.resolvedBy === b.resolvedBy &&
    a.resolvedAt === b.resolvedAt &&
    a.batchId === b.batchId
  )
}

function daysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((day) => set.has(day))
}

/**
 * Compara dos capturas del `Database` y devuelve solo lo que cambió, por tabla, en el orden en
 * que `supabaseRepository.save()` debe escribirlo. `activityPeriods` y `requestDays` se
 * resuelven como «sustituir el conjunto entero del padre afectado» en vez de diferenciar fila a
 * fila: son conjuntos pequeños, y sustituir esquiva el constraint `EXCLUDE` de no-solape de
 * `activity_periods`, que sí saltaría si se insertara un periodo nuevo antes de cerrar el viejo
 * en la misma operación.
 *
 * `employees` no lleva `insert`: un alta pasa por la Edge Function `crear-empleado` (necesita
 * crear antes el usuario de Auth), nunca por aquí — ver `AppContextValue.createEmployee`.
 *
 * `comments` solo lleva `insert` porque `request_comments` no tiene permiso de `update` ni
 * `delete`: un comentario es inmutable una vez escrito. Se compara por id a través de TODAS las
 * solicitudes anteriores, no solicitud a solicitud, porque separar un día
 * (`resolveRequestDay()`/`addRequestDayComment()`) mueve el hilo entero a una solicitud con un
 * id distinto, regenerando también el id de cada comentario copiado: cualquier id que no
 * existiera antes en ninguna solicitud es, por definición, una fila nueva que insertar.
 */
export function diffDatabase(previous: Database, next: Database): DatabaseDiff {
  const settings = settingsEqual(previous.settings, next.settings) ? null : next.settings

  const previousEmployees = new Map(previous.employees.map((employee) => [employee.id, employee]))
  const nextEmployees = new Map(next.employees.map((employee) => [employee.id, employee]))

  const employeeUpdates: Employee[] = []
  const activityPeriodsReplaceFor: string[] = []
  for (const employee of next.employees) {
    const before = previousEmployees.get(employee.id)
    if (!before) continue // alta: ya se escribió por la Edge Function antes de llegar aquí
    if (!employeeColumnsEqual(before, employee)) employeeUpdates.push(employee)
    if (!periodsEqual(before.activityPeriods, employee.activityPeriods)) {
      activityPeriodsReplaceFor.push(employee.id)
    }
  }
  const employeeDeletes = previous.employees
    .filter((employee) => !nextEmployees.has(employee.id))
    .map((employee) => employee.id)

  const previousHolidays = new Map(previous.holidays.map((holiday) => [holiday.id, holiday]))
  const nextHolidays = new Map(next.holidays.map((holiday) => [holiday.id, holiday]))
  const holidayInserts: Holiday[] = []
  const holidayUpdates: Holiday[] = []
  for (const holiday of next.holidays) {
    const before = previousHolidays.get(holiday.id)
    if (!before) holidayInserts.push(holiday)
    else if (!holidayColumnsEqual(before, holiday)) holidayUpdates.push(holiday)
  }
  const holidayDeletes = previous.holidays
    .filter((holiday) => !nextHolidays.has(holiday.id))
    .map((holiday) => holiday.id)

  const allowanceKey = (allowance: Allowance) => `${allowance.employeeId}:${allowance.year}`
  const previousAllowances = new Map(previous.allowances.map((item) => [allowanceKey(item), item]))
  const nextAllowanceKeys = new Set(next.allowances.map(allowanceKey))
  const allowanceUpserts = next.allowances.filter((allowance) => {
    const before = previousAllowances.get(allowanceKey(allowance))
    return !before || before.days !== allowance.days
  })
  const allowanceDeletes = previous.allowances
    .filter((allowance) => !nextAllowanceKeys.has(allowanceKey(allowance)))
    .map((allowance) => ({ employeeId: allowance.employeeId, year: allowance.year }))

  const previousRequests = new Map(previous.requests.map((request) => [request.id, request]))
  const nextRequests = new Map(next.requests.map((request) => [request.id, request]))
  const requestInserts: VacationRequest[] = []
  const requestUpdates: VacationRequest[] = []
  const requestDaysReplaceFor: string[] = []
  for (const request of next.requests) {
    const before = previousRequests.get(request.id)
    if (!before) {
      requestInserts.push(request)
      requestDaysReplaceFor.push(request.id)
      continue
    }
    if (!requestColumnsEqual(before, request)) requestUpdates.push(request)
    if (!daysEqual(before.days, request.days)) requestDaysReplaceFor.push(request.id)
  }
  const requestDeletes = previous.requests
    .filter((request) => !nextRequests.has(request.id))
    .map((request) => request.id)

  const previousCommentIds = new Set(
    previous.requests.flatMap((request) => request.comments.map((comment) => comment.id)),
  )
  const commentInserts = next.requests.flatMap((request) =>
    request.comments
      .filter((comment) => !previousCommentIds.has(comment.id))
      .map((comment) => ({ requestId: request.id, comment })),
  )

  return {
    settings,
    employees: { update: employeeUpdates, delete: employeeDeletes },
    activityPeriods: { replaceFor: activityPeriodsReplaceFor },
    holidays: { insert: holidayInserts, update: holidayUpdates, delete: holidayDeletes },
    allowances: { upsert: allowanceUpserts, delete: allowanceDeletes },
    requests: { insert: requestInserts, update: requestUpdates, delete: requestDeletes },
    requestDays: { replaceFor: requestDaysReplaceFor },
    comments: { insert: commentInserts },
  }
}

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
    return previous?.start === period.start && previous?.end === period.end
  })
}

interface EmployeesDiff {
  update: Employee[]
  delete: string[]
  activityPeriodsReplaceFor: string[]
}

function diffEmployees(previous: Employee[], next: Employee[]): EmployeesDiff {
  const previousById = new Map(previous.map((employee) => [employee.id, employee]))
  const nextIds = new Set(next.map((employee) => employee.id))

  const update: Employee[] = []
  const activityPeriodsReplaceFor: string[] = []
  for (const employee of next) {
    const before = previousById.get(employee.id)
    if (!before) continue // alta: ya se escribió por la Edge Function antes de llegar aquí
    if (!employeeColumnsEqual(before, employee)) update.push(employee)
    if (!periodsEqual(before.activityPeriods, employee.activityPeriods)) {
      activityPeriodsReplaceFor.push(employee.id)
    }
  }
  const deleted = previous
    .filter((employee) => !nextIds.has(employee.id))
    .map((employee) => employee.id)

  return { update, delete: deleted, activityPeriodsReplaceFor }
}

function holidayColumnsEqual(a: Holiday, b: Holiday): boolean {
  return a.date === b.date && a.name === b.name && a.scope === b.scope
}

function diffHolidays(previous: Holiday[], next: Holiday[]): DatabaseDiff['holidays'] {
  const previousById = new Map(previous.map((holiday) => [holiday.id, holiday]))
  const nextIds = new Set(next.map((holiday) => holiday.id))

  const insert: Holiday[] = []
  const update: Holiday[] = []
  for (const holiday of next) {
    const before = previousById.get(holiday.id)
    if (!before) insert.push(holiday)
    else if (!holidayColumnsEqual(before, holiday)) update.push(holiday)
  }
  const deleted = previous
    .filter((holiday) => !nextIds.has(holiday.id))
    .map((holiday) => holiday.id)

  return { insert, update, delete: deleted }
}

function allowanceKey(allowance: Allowance): string {
  return `${allowance.employeeId}:${allowance.year}`
}

function diffAllowances(previous: Allowance[], next: Allowance[]): DatabaseDiff['allowances'] {
  const previousByKey = new Map(previous.map((item) => [allowanceKey(item), item]))
  const nextKeys = new Set(next.map(allowanceKey))

  const upsert = next.filter(
    (allowance) => previousByKey.get(allowanceKey(allowance))?.days !== allowance.days,
  )
  const deleted = previous
    .filter((allowance) => !nextKeys.has(allowanceKey(allowance)))
    .map((allowance) => ({ employeeId: allowance.employeeId, year: allowance.year }))

  return { upsert, delete: deleted }
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

interface RequestsDiff {
  insert: VacationRequest[]
  update: VacationRequest[]
  delete: string[]
  requestDaysReplaceFor: string[]
}

function diffRequests(previous: VacationRequest[], next: VacationRequest[]): RequestsDiff {
  const previousById = new Map(previous.map((request) => [request.id, request]))
  const nextIds = new Set(next.map((request) => request.id))

  const insert: VacationRequest[] = []
  const update: VacationRequest[] = []
  const requestDaysReplaceFor: string[] = []
  for (const request of next) {
    const before = previousById.get(request.id)
    if (!before) {
      insert.push(request)
      requestDaysReplaceFor.push(request.id)
      continue
    }
    if (!requestColumnsEqual(before, request)) update.push(request)
    if (!daysEqual(before.days, request.days)) requestDaysReplaceFor.push(request.id)
  }
  const deleted = previous
    .filter((request) => !nextIds.has(request.id))
    .map((request) => request.id)

  return { insert, update, delete: deleted, requestDaysReplaceFor }
}

// Se compara por id a través de TODAS las solicitudes anteriores, no solicitud a solicitud,
// porque separar un día (resolveRequestDay()/addRequestDayComment()) mueve el hilo entero a una
// solicitud con un id distinto, regenerando también el id de cada comentario copiado: cualquier
// id que no existiera antes en ninguna solicitud es, por definición, una fila nueva que insertar.
function diffComments(
  previous: VacationRequest[],
  next: VacationRequest[],
): DatabaseDiff['comments']['insert'] {
  const previousCommentIds = new Set(
    previous.flatMap((request) => request.comments.map((comment) => comment.id)),
  )
  return next.flatMap((request) =>
    request.comments
      .filter((comment) => !previousCommentIds.has(comment.id))
      .map((comment) => ({ requestId: request.id, comment })),
  )
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
 * `delete`: un comentario es inmutable una vez escrito.
 */
export function diffDatabase(previous: Database, next: Database): DatabaseDiff {
  const employees = diffEmployees(previous.employees, next.employees)
  const requests = diffRequests(previous.requests, next.requests)

  return {
    settings: settingsEqual(previous.settings, next.settings) ? null : next.settings,
    employees: { update: employees.update, delete: employees.delete },
    activityPeriods: { replaceFor: employees.activityPeriodsReplaceFor },
    holidays: diffHolidays(previous.holidays, next.holidays),
    allowances: diffAllowances(previous.allowances, next.allowances),
    requests: { insert: requests.insert, update: requests.update, delete: requests.delete },
    requestDays: { replaceFor: requests.requestDaysReplaceFor },
    comments: { insert: diffComments(previous.requests, next.requests) },
  }
}

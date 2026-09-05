import { closeOpenPeriod, lastEndDate, openPeriod } from '../domain/accrual'
import { checkSelection, groupByYear } from '../domain/balance'
import { todayIso } from '../domain/dates'
import { formatDate } from '../domain/format'
import type {
  Database,
  Employee,
  IsoDate,
  RequestComment,
  RequestStatus,
  VacationRequest,
} from '../domain/types'
import { buildWorkCalendar, filterWorkingDays } from '../domain/workdays'
import { newId } from '../data/ids'

export type Outcome<T = Database> = { ok: true; database: T } | { ok: false; reason: string }

export interface CreateVacationInput {
  employeeId: string
  days: IsoDate[]
  status: Extract<RequestStatus, 'pendiente' | 'aprobada'>
  authorId: string
  comment?: string
  batchId?: string | null
}

function findEmployee(database: Database, employeeId: string): Employee | undefined {
  return database.employees.find((employee) => employee.id === employeeId)
}

export function displayName(employee: Employee): string {
  return `${employee.firstName} ${employee.lastName}`.trim()
}

export function sortByName(employees: Employee[]): Employee[] {
  return [...employees].sort((a, b) => displayName(a).localeCompare(displayName(b), 'es'))
}

function makeComment(database: Database, authorId: string, text: string): RequestComment {
  const author = findEmployee(database, authorId)
  return {
    id: newId('cmt'),
    authorId,
    authorName: author ? displayName(author) : 'Desconocido',
    text,
    createdAt: new Date().toISOString(),
  }
}

export function toWorkingDays(database: Database, days: Iterable<IsoDate>): IsoDate[] {
  const calendar = buildWorkCalendar(database.holidays, database.settings)
  return filterWorkingDays(calendar, days)
}

export function createVacation(database: Database, input: CreateVacationInput): Outcome {
  const employee = findEmployee(database, input.employeeId)
  if (!employee) return { ok: false, reason: 'El empleado no existe.' }

  const workingDays = toWorkingDays(database, input.days)
  if (workingDays.length === 0) {
    return { ok: false, reason: 'La selección no incluye ningún día laborable.' }
  }

  let draft = database

  for (const [year, days] of groupByYear(workingDays)) {
    const check = checkSelection(
      employee,
      days,
      year,
      draft.settings,
      draft.allowances,
      draft.requests,
    )
    if (!check.ok) return { ok: false, reason: check.reason }

    const now = new Date().toISOString()
    const request: VacationRequest = {
      id: newId('req'),
      employeeId: employee.id,
      year,
      days: check.days,
      status: input.status,
      createdBy: input.authorId,
      createdAt: now,
      resolvedBy: input.status === 'aprobada' ? input.authorId : null,
      resolvedAt: input.status === 'aprobada' ? now : null,
      comments: input.comment?.trim()
        ? [makeComment(draft, input.authorId, input.comment.trim())]
        : [],
      batchId: input.batchId ?? null,
    }

    draft = { ...draft, requests: [...draft.requests, request] }
  }

  return { ok: true, database: draft }
}

export interface BulkAssignInput {
  employeeIds: string[]
  days: IsoDate[]
  authorId: string
  comment?: string
}

export interface BulkAssignResult {
  database: Database
  assigned: { employeeId: string; name: string; days: number }[]
  skipped: { employeeId: string; name: string; reason: string }[]
}

export function bulkAssign(database: Database, input: BulkAssignInput): BulkAssignResult {
  const batchId = newId('batch')
  const result: BulkAssignResult = { database, assigned: [], skipped: [] }

  for (const employeeId of input.employeeIds) {
    const employee = findEmployee(result.database, employeeId)
    if (!employee) continue

    const outcome = createVacation(result.database, {
      employeeId,
      days: input.days,
      status: 'aprobada',
      authorId: input.authorId,
      comment: input.comment,
      batchId,
    })

    if (outcome.ok) {
      const added = outcome.database.requests
        .filter((request) => request.batchId === batchId && request.employeeId === employeeId)
        .reduce((total, request) => total + request.days.length, 0)
      result.database = outcome.database
      result.assigned.push({ employeeId, name: displayName(employee), days: added })
    } else {
      result.skipped.push({ employeeId, name: displayName(employee), reason: outcome.reason })
    }
  }

  return result
}

export function resolveRequest(
  database: Database,
  requestId: string,
  status: Extract<RequestStatus, 'aprobada' | 'rechazada'>,
  adminId: string,
  comment?: string,
): Outcome {
  const request = database.requests.find((item) => item.id === requestId)
  if (!request) return { ok: false, reason: 'La solicitud no existe.' }
  if (request.status !== 'pendiente') {
    return { ok: false, reason: 'La solicitud ya está resuelta.' }
  }

  const now = new Date().toISOString()
  const updated: VacationRequest = {
    ...request,
    status,
    resolvedBy: adminId,
    resolvedAt: now,
    comments: comment?.trim()
      ? [...request.comments, makeComment(database, adminId, comment.trim())]
      : request.comments,
  }

  return {
    ok: true,
    database: {
      ...database,
      requests: database.requests.map((item) => (item.id === requestId ? updated : item)),
    },
  }
}

export function resolveRequestDay(
  database: Database,
  requestId: string,
  day: IsoDate,
  status: Extract<RequestStatus, 'aprobada' | 'rechazada'>,
  adminId: string,
  comment?: string,
): Outcome {
  const request = database.requests.find((item) => item.id === requestId)
  if (!request) return { ok: false, reason: 'La solicitud no existe.' }
  if (request.status !== 'pendiente') {
    return { ok: false, reason: 'La solicitud ya está resuelta.' }
  }
  if (!request.days.includes(day)) {
    return { ok: false, reason: 'Ese día no pertenece a la solicitud.' }
  }

  const now = new Date().toISOString()
  const comments = comment?.trim()
    ? [...request.comments, makeComment(database, adminId, comment.trim())]
    : request.comments
  const remainingDays = request.days.filter((item) => item !== day)

  const resolvedDay: VacationRequest = {
    ...request,
    id: remainingDays.length === 0 ? request.id : newId('req'),
    days: [day],
    status,
    resolvedBy: adminId,
    resolvedAt: now,
    comments,
  }

  if (remainingDays.length === 0) {
    return {
      ok: true,
      database: {
        ...database,
        requests: database.requests.map((item) => (item.id === requestId ? resolvedDay : item)),
      },
    }
  }

  const stillPending: VacationRequest = { ...request, days: remainingDays }
  return {
    ok: true,
    database: {
      ...database,
      requests: [
        ...database.requests.map((item) => (item.id === requestId ? stillPending : item)),
        resolvedDay,
      ],
    },
  }
}

export function resolveAllPending(
  database: Database,
  employeeId: string,
  year: number,
  status: Extract<RequestStatus, 'aprobada' | 'rechazada'>,
  adminId: string,
): Outcome {
  const pendingIds = database.requests
    .filter(
      (request) =>
        request.employeeId === employeeId &&
        request.year === year &&
        request.status === 'pendiente',
    )
    .map((request) => request.id)

  if (pendingIds.length === 0) {
    return { ok: false, reason: 'No hay solicitudes pendientes para este empleado.' }
  }

  let draft = database
  for (const id of pendingIds) {
    const outcome = resolveRequest(draft, id, status, adminId)
    if (!outcome.ok) return outcome
    draft = outcome.database
  }

  return { ok: true, database: draft }
}

export function removeRequestDay(
  database: Database,
  requestId: string,
  day: IsoDate,
  actor: Employee,
): Outcome {
  const request = database.requests.find((item) => item.id === requestId)
  if (!request) return { ok: false, reason: 'La solicitud no existe.' }
  if (!request.days.includes(day)) {
    return { ok: false, reason: 'Ese día no pertenece a la solicitud.' }
  }

  const isAdmin = actor.role === 'admin'
  if (!isAdmin) {
    if (request.employeeId !== actor.id) {
      return { ok: false, reason: 'Solo puedes cancelar tus propias solicitudes.' }
    }
    if (request.status !== 'pendiente') {
      return { ok: false, reason: 'Solo se pueden cancelar las solicitudes pendientes.' }
    }
  }

  const remainingDays = request.days.filter((item) => item !== day)
  if (remainingDays.length === 0) {
    return {
      ok: true,
      database: {
        ...database,
        requests: database.requests.filter((item) => item.id !== requestId),
      },
    }
  }

  return {
    ok: true,
    database: {
      ...database,
      requests: database.requests.map((item) =>
        item.id === requestId ? { ...item, days: remainingDays } : item,
      ),
    },
  }
}

export function removeRequest(database: Database, requestId: string, actor: Employee): Outcome {
  const request = database.requests.find((item) => item.id === requestId)
  if (!request) return { ok: false, reason: 'La solicitud no existe.' }

  const isAdmin = actor.role === 'admin'
  if (!isAdmin) {
    if (request.employeeId !== actor.id) {
      return { ok: false, reason: 'Solo puedes cancelar tus propias solicitudes.' }
    }
    if (request.status !== 'pendiente') {
      return { ok: false, reason: 'Solo se pueden cancelar las solicitudes pendientes.' }
    }
  }

  return {
    ok: true,
    database: {
      ...database,
      requests: database.requests.filter((item) => item.id !== requestId),
    },
  }
}

export function addRequestComment(
  database: Database,
  requestId: string,
  authorId: string,
  text: string,
): Outcome {
  if (!text.trim()) return { ok: false, reason: 'El comentario está vacío.' }
  const exists = database.requests.some((item) => item.id === requestId)
  if (!exists) return { ok: false, reason: 'La solicitud no existe.' }

  const comment = makeComment(database, authorId, text.trim())
  return {
    ok: true,
    database: {
      ...database,
      requests: database.requests.map((item) =>
        item.id === requestId ? { ...item, comments: [...item.comments, comment] } : item,
      ),
    },
  }
}

export function setAllowance(
  database: Database,
  employeeId: string,
  year: number,
  days: number,
): Outcome {
  const committed = database.requests
    .filter(
      (request) =>
        request.employeeId === employeeId &&
        request.year === year &&
        request.status !== 'rechazada',
    )
    .reduce((total, request) => total + request.days.length, 0)

  if (days < committed) {
    return {
      ok: false,
      reason: `No se puede bajar de ${committed}: es lo que el empleado ya tiene solicitado o aprobado.`,
    }
  }

  const others = database.allowances.filter(
    (allowance) => !(allowance.employeeId === employeeId && allowance.year === year),
  )
  return {
    ok: true,
    database: { ...database, allowances: [...others, { employeeId, year, days }] },
  }
}

export function clearAllowance(database: Database, employeeId: string, year: number): Database {
  return {
    ...database,
    allowances: database.allowances.filter(
      (allowance) => !(allowance.employeeId === employeeId && allowance.year === year),
    ),
  }
}

function replaceEmployee(database: Database, updated: Employee): Database {
  return {
    ...database,
    employees: database.employees.map((employee) =>
      employee.id === updated.id ? updated : employee,
    ),
  }
}

export function terminateEmployee(
  database: Database,
  employeeId: string,
  date: IsoDate = todayIso(),
): Outcome {
  const employee = findEmployee(database, employeeId)
  if (!employee) return { ok: false, reason: 'El empleado no existe.' }

  const open = openPeriod(employee)
  if (!open) return { ok: false, reason: `${displayName(employee)} ya está de baja.` }
  if (date < open.start) {
    return {
      ok: false,
      reason: `La baja no puede ser anterior al alta del ${formatDate(open.start)}.`,
    }
  }

  return {
    ok: true,
    database: replaceEmployee(database, {
      ...employee,
      activityPeriods: closeOpenPeriod(employee.activityPeriods, date),
    }),
  }
}

export function rehireEmployee(
  database: Database,
  employeeId: string,
  date: IsoDate = todayIso(),
): Outcome {
  const employee = findEmployee(database, employeeId)
  if (!employee) return { ok: false, reason: 'El empleado no existe.' }
  if (openPeriod(employee))
    return { ok: false, reason: `${displayName(employee)} ya está de alta.` }

  const last = lastEndDate(employee)
  if (last !== null && date <= last) {
    return { ok: false, reason: `El alta debe ser posterior a la baja del ${formatDate(last)}.` }
  }

  return {
    ok: true,
    database: replaceEmployee(database, {
      ...employee,
      activityPeriods: [...employee.activityPeriods, { id: newId('per'), start: date, end: null }],
    }),
  }
}

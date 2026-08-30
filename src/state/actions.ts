import { checkSelection, groupByYear } from '../domain/balance'
import { todayIso } from '../domain/dates'
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

/**
 * Operaciones de negocio como transformaciones puras de la base de datos.
 * Mantenerlas fuera de React permite encadenarlas —una asignación masiva son
 * varias altas seguidas— validando cada paso contra el estado ya modificado.
 */

export type Outcome<T = Database> =
  | { ok: true; database: T }
  | { ok: false; reason: string }

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

/** Quita de la selección los domingos y festivos: no computan ni se guardan. */
export function toWorkingDays(database: Database, days: Iterable<IsoDate>): IsoDate[] {
  const calendar = buildWorkCalendar(database.holidays, database.settings)
  return filterWorkingDays(calendar, days)
}

/**
 * Crea las vacaciones de un empleado. Una selección a caballo entre dos años
 * genera una solicitud por año, porque el saldo es anual.
 */
export function createVacation(database: Database, input: CreateVacationInput): Outcome {
  const employee = findEmployee(database, input.employeeId)
  if (!employee) return { ok: false, reason: 'El empleado no existe.' }

  const workingDays = toWorkingDays(database, input.days)
  if (workingDays.length === 0) {
    return { ok: false, reason: 'La selección no incluye ningún día laborable.' }
  }

  let draft = database
  const created: VacationRequest[] = []

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

    created.push(request)
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

/**
 * Asigna el mismo periodo a varios empleados como vacaciones ya aprobadas.
 * Los días computan en el límite individual de cada uno, así que un empleado
 * sin saldo se queda fuera y se informa del motivo en lugar de fallar todo.
 */
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

/**
 * El empleado solo puede retirar sus solicitudes mientras están pendientes.
 * El administrador puede eliminar cualquiera, incluidas las ya aprobadas, y los
 * días vuelven al saldo.
 */
export function removeRequest(
  database: Database,
  requestId: string,
  actor: Employee,
): Outcome {
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
  const request = database.requests.find((item) => item.id === requestId)
  if (!request) return { ok: false, reason: 'La solicitud no existe.' }

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

/**
 * Ajusta a mano los días de un empleado con los controles + y −. El valor
 * nunca puede quedar por debajo de los días ya comprometidos.
 */
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

/** Elimina el ajuste manual y devuelve el empleado a la estimación automática. */
export function clearAllowance(database: Database, employeeId: string, year: number): Database {
  return {
    ...database,
    allowances: database.allowances.filter(
      (allowance) => !(allowance.employeeId === employeeId && allowance.year === year),
    ),
  }
}

/**
 * Da de baja a un empleado conservando su histórico. Se marca la fecha de baja
 * en lugar de borrar el registro para no perder las vacaciones ya disfrutadas.
 */
export function terminateEmployee(database: Database, employeeId: string): Database {
  return {
    ...database,
    employees: database.employees.map((employee) =>
      employee.id === employeeId
        ? { ...employee, terminationDate: employee.terminationDate ?? todayIso() }
        : employee,
    ),
  }
}

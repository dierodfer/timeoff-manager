import { compareIso } from '../domain/dates'
import { displayName } from '../state/actions'
import type {
  Employee,
  IsoDate,
  RequestComment,
  RequestStatus,
  VacationRequest,
} from '../domain/types'

export type RequestFilter = RequestStatus | 'todas'

export interface DayRow {
  day: IsoDate
  status: RequestStatus
  requestId: string
  comments: RequestComment[]
}

export interface EmployeeGroup {
  employee: Employee
  rows: DayRow[]
  pendingCount: number
  requestCount: number
  totalDays: number
}

export function rowKey(requestId: string, day: IsoDate): string {
  return `${requestId}|${day}`
}

export function toggleInSet(set: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(set)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  return next
}

/** Días de cada estado en el año, para los contadores de las pestañas. */
export function countDaysByStatus(
  requests: VacationRequest[],
  year: number,
): Record<RequestStatus, number> {
  const counts: Record<RequestStatus, number> = { pendiente: 0, aprobada: 0, rechazada: 0 }
  for (const request of requests) {
    if (request.year !== year) continue
    counts[request.status] += request.days.length
  }
  return counts
}

/**
 * Una tarjeta por empleado, con una fila por día.
 *
 * Los totales de la cabecera (`requestCount`, `totalDays`) cuentan **todo el año**, sean del
 * estado que sean, mientras que `rows` solo trae lo que deja pasar el filtro: la cabecera
 * dice cuánto hay en total y la tabla de debajo, lo que se está mirando.
 */
export function groupRequestsByEmployee(
  requests: VacationRequest[],
  employees: Employee[],
  year: number,
  filter: RequestFilter,
): EmployeeGroup[] {
  const rowsByEmployee = new Map<string, DayRow[]>()
  const totalsByEmployee = new Map<string, { requestCount: number; totalDays: number }>()

  for (const request of requests) {
    if (request.year !== year) continue

    const totals = totalsByEmployee.get(request.employeeId) ?? { requestCount: 0, totalDays: 0 }
    totals.requestCount += 1
    totals.totalDays += request.days.length
    totalsByEmployee.set(request.employeeId, totals)

    if (filter !== 'todas' && request.status !== filter) continue
    const rows = rowsByEmployee.get(request.employeeId) ?? []
    for (const day of request.days) {
      rows.push({ day, status: request.status, requestId: request.id, comments: request.comments })
    }
    rowsByEmployee.set(request.employeeId, rows)
  }

  return employees
    .filter((employee) => rowsByEmployee.has(employee.id))
    .sort((a, b) => displayName(a).localeCompare(displayName(b), 'es'))
    .map((employee): EmployeeGroup => {
      const rows = [...(rowsByEmployee.get(employee.id) ?? [])].sort((a, b) =>
        compareIso(a.day, b.day),
      )
      const totals = totalsByEmployee.get(employee.id) ?? { requestCount: 0, totalDays: 0 }
      return {
        employee,
        rows,
        pendingCount: rows.filter((row) => row.status === 'pendiente').length,
        requestCount: totals.requestCount,
        totalDays: totals.totalDays,
      }
    })
}

/** Claves de los días pendientes del grupo: lo seleccionable. */
export function pendingKeysOf(group: EmployeeGroup): string[] {
  return group.rows
    .filter((row) => row.status === 'pendiente')
    .map((row) => rowKey(row.requestId, row.day))
}

/** Los días pendientes del grupo que están marcados, en el formato que espera actions.ts. */
export function selectionOf(
  group: EmployeeGroup,
  selected: ReadonlySet<string>,
): { requestId: string; day: IsoDate }[] {
  return group.rows
    .filter((row) => row.status === 'pendiente' && selected.has(rowKey(row.requestId, row.day)))
    .map((row) => ({ requestId: row.requestId, day: row.day }))
}

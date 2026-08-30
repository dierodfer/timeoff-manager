import { effectiveAnnualDays, estimateAnnualDays } from './accrual'
import { yearOf } from './dates'
import type { Allowance, Employee, IsoDate, Settings, VacationRequest } from './types'

export interface Balance {
  year: number
  /** Días efectivos: el ajuste manual si existe, si no la estimación. */
  assigned: number
  /** Estimación automática, para poder mostrar de dónde sale el valor. */
  estimated: number
  /** Cierto cuando el administrador ha ajustado el número a mano. */
  isOverridden: boolean
  approved: number
  pending: number
  /** Días libres todavía comprometibles. Nunca puede quedar en negativo. */
  available: number
}

export function requestsOf(
  requests: VacationRequest[],
  employeeId: string,
  year: number,
): VacationRequest[] {
  return requests.filter(
    (request) => request.employeeId === employeeId && request.year === year,
  )
}

/**
 * Días ya comprometidos por el empleado en el año: los aprobados y también los
 * pendientes, para que una solicitud en curso no pueda gastarse dos veces.
 */
export function committedDays(
  requests: VacationRequest[],
  employeeId: string,
  year: number,
): Set<IsoDate> {
  const days = new Set<IsoDate>()
  for (const request of requestsOf(requests, employeeId, year)) {
    if (request.status === 'rechazada') continue
    for (const day of request.days) days.add(day)
  }
  return days
}

export function computeBalance(
  employee: Employee,
  year: number,
  settings: Settings,
  allowances: Allowance[],
  requests: VacationRequest[],
): Balance {
  const assigned = effectiveAnnualDays(employee, year, settings.defaultAnnualDays, allowances)
  const estimated = estimateAnnualDays(employee, year, settings.defaultAnnualDays)
  const mine = requestsOf(requests, employee.id, year)

  const approved = mine
    .filter((request) => request.status === 'aprobada')
    .reduce((total, request) => total + request.days.length, 0)
  const pending = mine
    .filter((request) => request.status === 'pendiente')
    .reduce((total, request) => total + request.days.length, 0)

  return {
    year,
    assigned,
    estimated,
    isOverridden: assigned !== estimated,
    approved,
    pending,
    available: Math.max(0, assigned - approved - pending),
  }
}

export type SelectionCheck =
  | { ok: true; days: IsoDate[] }
  | { ok: false; reason: string; days: IsoDate[] }

/**
 * Comprueba que un conjunto de días laborables se puede comprometer para un
 * empleado: sin repetir días ya solicitados y sin superar su saldo.
 *
 * El límite se aplica también al administrador; para asignar más días hay que
 * subir antes el contador del empleado.
 */
export function checkSelection(
  employee: Employee,
  days: IsoDate[],
  year: number,
  settings: Settings,
  allowances: Allowance[],
  requests: VacationRequest[],
): SelectionCheck {
  const yearDays = days.filter((day) => yearOf(day) === year).sort()

  if (yearDays.length === 0) {
    return { ok: false, reason: 'No hay ningún día laborable en la selección.', days: yearDays }
  }

  const committed = committedDays(requests, employee.id, year)
  const repeated = yearDays.filter((day) => committed.has(day))
  if (repeated.length > 0) {
    return {
      ok: false,
      reason:
        repeated.length === 1
          ? `El día ${repeated[0]} ya está solicitado o aprobado.`
          : `Hay ${repeated.length} días que ya están solicitados o aprobados.`,
      days: yearDays,
    }
  }

  const balance = computeBalance(employee, year, settings, allowances, requests)
  if (yearDays.length > balance.available) {
    return {
      ok: false,
      reason:
        `Saldo insuficiente: quedan ${balance.available} ${balance.available === 1 ? 'día' : 'días'}` +
        ` y se intentan reservar ${yearDays.length}.`,
      days: yearDays,
    }
  }

  return { ok: true, days: yearDays }
}

/** Agrupa una selección por año natural: cada año genera su propia solicitud. */
export function groupByYear(days: IsoDate[]): Map<number, IsoDate[]> {
  const grouped = new Map<number, IsoDate[]>()
  for (const day of [...days].sort()) {
    const year = yearOf(day)
    const bucket = grouped.get(year)
    if (bucket) bucket.push(day)
    else grouped.set(year, [day])
  }
  return grouped
}

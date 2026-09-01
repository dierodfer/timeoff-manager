import { effectiveAnnualDays, estimateAnnualDays } from './accrual'
import { compareIso, todayIso, yearOf } from './dates'
import { pluralDays } from './format'
import type { Allowance, Employee, IsoDate, Settings, VacationRequest } from './types'

export interface Balance {
  year: number
  assigned: number
  estimated: number
  isOverridden: boolean
  approved: number
  pending: number
  available: number
}

export function requestsOf(
  requests: VacationRequest[],
  employeeId: string,
  year: number,
): VacationRequest[] {
  return requests.filter((request) => request.employeeId === employeeId && request.year === year)
}

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
  today: IsoDate = todayIso(),
): Balance {
  const assigned = effectiveAnnualDays(employee, year, settings, allowances, today)
  const estimated = estimateAnnualDays(employee, year, settings, today)
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

export interface EmployeeBalance {
  employee: Employee
  balance: Balance
}

export function withBalances(
  employees: Employee[],
  year: number,
  settings: Settings,
  allowances: Allowance[],
  requests: VacationRequest[],
  today: IsoDate = todayIso(),
): EmployeeBalance[] {
  return employees.map((employee) => ({
    employee,
    balance: computeBalance(employee, year, settings, allowances, requests, today),
  }))
}

export interface TerminationSettlement {
  taken: number
  entitlement: number
  difference: number
}

export function terminationSettlement(
  employee: Employee,
  year: number,
  settings: Settings,
  requests: VacationRequest[],
  terminationDate: IsoDate,
  today: IsoDate = todayIso(),
): TerminationSettlement {
  const taken = requestsOf(requests, employee.id, year)
    .filter((request) => request.status === 'aprobada')
    .reduce((total, request) => total + request.days.filter((day) => day <= today).length, 0)

  const entitlement = estimateAnnualDays({ ...employee, terminationDate }, year, settings, today)

  return { taken, entitlement, difference: entitlement - taken }
}

export type SelectionCheck =
  { ok: true; days: IsoDate[] } | { ok: false; reason: string; days: IsoDate[] }

export function checkSelection(
  employee: Employee,
  days: IsoDate[],
  year: number,
  settings: Settings,
  allowances: Allowance[],
  requests: VacationRequest[],
  today: IsoDate = todayIso(),
): SelectionCheck {
  const yearDays = days.filter((day) => yearOf(day) === year).sort(compareIso)

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

  const balance = computeBalance(employee, year, settings, allowances, requests, today)
  // Margen para el ruido de coma flotante: evita rechazar 13 días contra un saldo de 12,999999999.
  if (yearDays.length > balance.available + 1e-9) {
    return {
      ok: false,
      reason:
        `Saldo insuficiente: quedan ${pluralDays(balance.available)}` +
        ` y se intentan reservar ${yearDays.length}.`,
      days: yearDays,
    }
  }

  return { ok: true, days: yearDays }
}

export function groupByYear(days: IsoDate[]): Map<number, IsoDate[]> {
  const grouped = new Map<number, IsoDate[]>()
  for (const day of [...days].sort(compareIso)) {
    const year = yearOf(day)
    const bucket = grouped.get(year)
    if (bucket) bucket.push(day)
    else grouped.set(year, [day])
  }
  return grouped
}

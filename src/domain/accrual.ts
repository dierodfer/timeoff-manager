import { daysBetweenInclusive, daysInYear, overlapDays, yearEnd, yearStart } from './dates'
import type { Allowance, Employee, IsoDate } from './types'

interface Interval {
  start: IsoDate
  end: IsoDate
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals]
    .filter((interval) => interval.start <= interval.end)
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))

  const merged: Interval[] = []
  for (const interval of sorted) {
    const last = merged[merged.length - 1]
    if (last && interval.start <= last.end) {
      if (interval.end > last.end) last.end = interval.end
    } else {
      merged.push({ ...interval })
    }
  }
  return merged
}

export function employmentSpanInYear(employee: Employee, year: number): Interval | null {
  const start = employee.hireDate > yearStart(year) ? employee.hireDate : yearStart(year)
  const end =
    employee.terminationDate && employee.terminationDate < yearEnd(year)
      ? employee.terminationDate
      : yearEnd(year)
  return start <= end ? { start, end } : null
}

export function activeDaysInYear(employee: Employee, year: number): number {
  const span = employmentSpanInYear(employee, year)
  if (!span) return 0

  if (!employee.isSeasonal) {
    return daysBetweenInclusive(span.start, span.end)
  }

  return mergeIntervals(employee.activityPeriods).reduce(
    (total, period) => total + overlapDays(period.start, period.end, span.start, span.end),
    0,
  )
}

export function estimateAnnualDays(
  employee: Employee,
  year: number,
  baseAnnualDays: number,
): number {
  const activeDays = activeDaysInYear(employee, year)
  if (activeDays <= 0) return 0
  const estimate = Math.round((baseAnnualDays * activeDays) / daysInYear(year))
  return Math.min(estimate, baseAnnualDays)
}

export function findAllowance(
  allowances: Allowance[],
  employeeId: string,
  year: number,
): Allowance | undefined {
  return allowances.find(
    (allowance) => allowance.employeeId === employeeId && allowance.year === year,
  )
}

export function effectiveAnnualDays(
  employee: Employee,
  year: number,
  baseAnnualDays: number,
  allowances: Allowance[],
): number {
  const override = findAllowance(allowances, employee.id, year)
  return override ? override.days : estimateAnnualDays(employee, year, baseAnnualDays)
}

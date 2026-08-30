import { expandRange, todayIso, weekday, yearEnd, yearStart } from './dates'
import type { Allowance, Employee, IsoDate, Settings } from './types'

export const ACCRUAL_PER_WORKED_DAY = 0.0737

export interface Interval {
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

export function activeIntervalsInYear(
  employee: Employee,
  year: number,
  today: IsoDate,
): Interval[] {
  const span = employmentSpanInYear(employee, year)
  if (!span) return []
  if (!employee.isSeasonal) return [span]

  const withinSpan = mergeIntervals(employee.activityPeriods)
    .map((period) => ({
      start: period.start > span.start ? period.start : span.start,
      end: period.end < span.end ? period.end : span.end,
    }))
    .filter((period) => period.start <= period.end)

  const projected = withinSpan.map((period) =>
    today >= period.start && today <= period.end ? { start: period.start, end: span.end } : period,
  )

  return mergeIntervals(projected)
}

export function workedDaysInYear(
  employee: Employee,
  year: number,
  workweek: number[],
  today: IsoDate = todayIso(),
): number {
  const workdays = new Set(workweek)
  return activeIntervalsInYear(employee, year, today).reduce(
    (total, interval) =>
      total +
      expandRange(interval.start, interval.end).filter((date) => workdays.has(weekday(date)))
        .length,
    0,
  )
}

export function estimateAnnualDays(
  employee: Employee,
  year: number,
  settings: Settings,
  today: IsoDate = todayIso(),
): number {
  const worked = workedDaysInYear(employee, year, settings.workweek, today)
  if (worked <= 0) return 0
  return Math.min(worked * ACCRUAL_PER_WORKED_DAY, settings.defaultAnnualDays)
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
  settings: Settings,
  allowances: Allowance[],
  today: IsoDate = todayIso(),
): number {
  const override = findAllowance(allowances, employee.id, year)
  return override ? override.days : estimateAnnualDays(employee, year, settings, today)
}

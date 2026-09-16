import {
  compareIso,
  daysBetweenInclusive,
  daysInYear,
  expandRange,
  overlapDays,
  todayIso,
  weekday,
  yearEnd,
  yearStart,
} from './dates'
import { roundDays } from './format'
import type { ActivityPeriod, Allowance, Employee, Holiday, IsoDate, Settings } from './types'
import { holidayOn, workingDaysInRange, type WorkCalendar } from './workdays'

const OPEN_END: IsoDate = '9999-12-31'

export interface Interval {
  start: IsoDate
  end: IsoDate
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals]
    .filter((interval) => interval.start <= interval.end)
    .sort((a, b) => compareIso(a.start, b.start))

  const merged: Interval[] = []
  for (const interval of sorted) {
    const last = merged.at(-1)
    if (last && interval.start <= last.end) {
      if (interval.end > last.end) last.end = interval.end
    } else {
      merged.push({ ...interval })
    }
  }
  return merged
}

export function hasOverlap(intervals: Interval[]): boolean {
  return intervals.some((interval, index) =>
    intervals
      .slice(index + 1)
      .some((other) => overlapDays(interval.start, interval.end, other.start, other.end) > 0),
  )
}

export function periodsOverlap(periods: ActivityPeriod[]): boolean {
  return hasOverlap(periods.map((period) => ({ ...period, end: period.end ?? OPEN_END })))
}

export function sortedPeriods(employee: Employee): ActivityPeriod[] {
  return [...employee.activityPeriods].sort((a, b) => compareIso(a.start, b.start))
}

export function openPeriod(employee: Employee): ActivityPeriod | undefined {
  return employee.activityPeriods.find((period) => period.end === null)
}

export function hireDateOf(employee: Employee): IsoDate {
  return sortedPeriods(employee)[0]?.start ?? employee.createdAt.slice(0, 10)
}

export function lastEndDate(employee: Employee): IsoDate | null {
  return sortedPeriods(employee).at(-1)?.end ?? null
}

export function isActive(employee: Employee, today: IsoDate = todayIso()): boolean {
  return employee.activityPeriods.some(
    (period) => period.start <= today && (period.end === null || today <= period.end),
  )
}

export function closeOpenPeriod(periods: ActivityPeriod[], date: IsoDate): ActivityPeriod[] {
  return periods.map((period) => (period.end === null ? { ...period, end: date } : period))
}

export function activityIntervalsInYear(employee: Employee, year: number): Interval[] {
  const from = yearStart(year)
  const to = yearEnd(year)
  return mergeIntervals(
    employee.activityPeriods
      .map((period) => ({
        start: period.start > from ? period.start : from,
        end: period.end !== null && period.end < to ? period.end : to,
      }))
      .filter((interval) => interval.start <= interval.end),
  )
}

export function isActiveInYear(employee: Employee, year: number): boolean {
  return employee.activityPeriods.some(
    (period) =>
      period.start <= yearEnd(year) && (period.end === null || period.end >= yearStart(year)),
  )
}

export interface WorkedRange {
  start: IsoDate
  end: IsoDate
  days: number
}

export interface WorkedDaysBreakdown {
  total: number
  ranges: WorkedRange[]
  holidays: Holiday[]
}

/** Días de jornada, sin festivos, dentro de los tramos del año hasta `until`: es lo que enseña
 * la lista de Empleados, no lo que alimenta la estimación (ver CLAUDE.md, «Estimación»). */
export function workedDaysBreakdown(
  employee: Employee,
  year: number,
  calendar: WorkCalendar,
  until: IsoDate = todayIso(),
): WorkedDaysBreakdown {
  const ranges: WorkedRange[] = []
  const holidaysByDate = new Map<IsoDate, Holiday>()

  for (const interval of activityIntervalsInYear(employee, year)) {
    const end = interval.end < until ? interval.end : until
    if (interval.start > end) continue

    ranges.push({
      start: interval.start,
      end,
      days: workingDaysInRange(calendar, interval.start, end).length,
    })

    for (const date of expandRange(interval.start, end)) {
      if (!calendar.workweek.has(weekday(date))) continue
      const holiday = holidayOn(calendar, date)
      if (holiday) holidaysByDate.set(date, holiday)
    }
  }

  return {
    total: ranges.reduce((sum, range) => sum + range.days, 0),
    ranges,
    holidays: [...holidaysByDate.values()].sort((a, b) => compareIso(a.date, b.date)),
  }
}

/** Días naturales de alta dentro del año: no solo los de jornada, los tramos enteros. */
export function altaDaysInYear(employee: Employee, year: number): number {
  return activityIntervalsInYear(employee, year).reduce(
    (total, interval) => total + daysBetweenInclusive(interval.start, interval.end),
    0,
  )
}

export interface EstimateBreakdown {
  altaDays: number
  daysInYear: number
  annualDays: number
  raw: number
}

/** altaDays / daysInYear nunca supera 1 (activityIntervalsInYear() recorta al año), así que
 * `raw` nunca supera `annualDays`: no hace falta un tope aparte. */
export function estimateAnnualDaysBreakdown(
  employee: Employee,
  year: number,
  settings: Settings,
): EstimateBreakdown {
  const altaDays = altaDaysInYear(employee, year)
  const totalDays = daysInYear(year)
  return {
    altaDays,
    daysInYear: totalDays,
    annualDays: settings.defaultAnnualDays,
    raw: roundDays((altaDays * settings.defaultAnnualDays) / totalDays),
  }
}

export function estimateAnnualDays(employee: Employee, year: number, settings: Settings): number {
  return estimateAnnualDaysBreakdown(employee, year, settings).raw
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
): number {
  const override = findAllowance(allowances, employee.id, year)
  return override ? override.days : estimateAnnualDays(employee, year, settings)
}

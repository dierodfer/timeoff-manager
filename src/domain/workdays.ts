import { compareIso, expandRange, weekday } from './dates'
import type { Holiday, IsoDate, Settings } from './types'

export interface WorkCalendar {
  workweek: Set<number>
  holidaysByDate: Map<IsoDate, Holiday>
}

export function buildWorkCalendar(holidays: Holiday[], settings: Settings): WorkCalendar {
  return {
    workweek: new Set(settings.workweek),
    holidaysByDate: new Map(holidays.map((holiday) => [holiday.date, holiday])),
  }
}

export function holidayOn(calendar: WorkCalendar, date: IsoDate): Holiday | undefined {
  return calendar.holidaysByDate.get(date)
}

export function isWorkingDay(calendar: WorkCalendar, date: IsoDate): boolean {
  if (!calendar.workweek.has(weekday(date))) return false
  return !calendar.holidaysByDate.has(date)
}

export function filterWorkingDays(calendar: WorkCalendar, dates: Iterable<IsoDate>): IsoDate[] {
  return [...dates].filter((date) => isWorkingDay(calendar, date)).sort(compareIso)
}

export function workingDaysInRange(
  calendar: WorkCalendar,
  start: IsoDate,
  end: IsoDate,
): IsoDate[] {
  return filterWorkingDays(calendar, expandRange(start, end))
}

export const WEEKDAY_LABELS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'] as const
export const WEEKDAY_NAMES = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
] as const

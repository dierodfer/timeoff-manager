import { expandRange, weekday } from './dates'
import type { Holiday, IsoDate, Settings } from './types'

/**
 * Calendario laboral efectivo: qué días de la semana se trabajan y qué fechas
 * concretas son festivas. Se construye una vez por año y se reutiliza en toda
 * la interfaz para no recalcular el conjunto de festivos en cada celda.
 */
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

/** Un día laborable es el que entra en la jornada semanal y no es festivo. */
export function isWorkingDay(calendar: WorkCalendar, date: IsoDate): boolean {
  if (!calendar.workweek.has(weekday(date))) return false
  return !calendar.holidaysByDate.has(date)
}

/** Motivo por el que un día no computa, para poder explicarlo en la interfaz. */
export function nonWorkingReason(
  calendar: WorkCalendar,
  date: IsoDate,
): 'festivo' | 'no-laborable' | null {
  if (calendar.holidaysByDate.has(date)) return 'festivo'
  if (!calendar.workweek.has(weekday(date))) return 'no-laborable'
  return null
}

export function filterWorkingDays(calendar: WorkCalendar, dates: Iterable<IsoDate>): IsoDate[] {
  return [...dates].filter((date) => isWorkingDay(calendar, date)).sort()
}

/** Días laborables de un rango cerrado, descartando domingos y festivos. */
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

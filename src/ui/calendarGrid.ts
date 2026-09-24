import { compareIso, dayOf, daysInMonth, isoOf, monthOf, weekday, yearOf } from '../domain/dates'
import { formatDate } from '../domain/format'
import { WEEKDAY_NAMES } from '../domain/workdays'
import type { Holiday, HolidayScope, IsoDate, RequestStatus } from '../domain/types'
import type { DayMark } from './MonthCalendar'

export const WEEK_COLUMNS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const

export const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
] as const

export function columnOf(date: IsoDate): number {
  return (weekday(date) + 6) % 7
}

export function monthCells(year: number, month: number): IsoDate[] {
  const cells: IsoDate[] = []
  for (let day = 1; day <= daysInMonth(year, month); day += 1) {
    cells.push(isoOf(year, month, day))
  }
  return cells
}

export function firstDayOffset(date: IsoDate): { gridColumnStart: number } {
  return { gridColumnStart: columnOf(date) + 1 }
}

export function yearDays(year: number): IsoDate[] {
  const days: IsoDate[] = []
  for (let month = 1; month <= 12; month += 1) {
    for (let day = 1; day <= daysInMonth(year, month); day += 1) {
      days.push(isoOf(year, month, day))
    }
  }
  return days
}

export function formatLongDate(date: IsoDate): string {
  const [year, month, day] = date.split('-').map(Number)
  return `${day} de ${MONTH_NAMES[month - 1].toLowerCase()} de ${year}`
}

/** Tramos de días consecutivos dentro de un mismo mes (ya no lleva año: quien lo lee lo ve en la
 * propia etiqueta del mes). Cortar por mes antes de fusionar significa que un tramo que cruza de
 * mes (30-31 de enero, 1-2 de febrero) ya se separa solo, sin lógica aparte. */
function dayRangesInMonth(days: number[]): number[][] {
  const sorted = [...days].sort((a, b) => a - b)
  const ranges: number[][] = []
  for (const day of sorted) {
    const last = ranges.at(-1)
    if (last && day === (last.at(-1) as number) + 1) last.push(day)
    else ranges.push([day])
  }
  return ranges
}

function formatDayRangeInMonth(range: number[]): string {
  const start = range[0]
  const end = range.at(-1) as number
  return start === end ? `${start}` : `${start}–${end}`
}

/** «Jun: 9–10, 16–17 · Ago: 4, 7–8, 11»: agrupa por mes, y dentro de cada uno solo pinta el
 * número de día, no la fecha completa — el mes ya va en la etiqueta y el año es el que se está
 * mirando. Sustituye a un listado de fechas completas separadas por comas, ilegible en cuanto
 * hay más de dos o tres tramos seleccionados. */
export function summarizeDays(days: IsoDate[]): string {
  if (days.length === 0) return '—'

  const byMonth = new Map<string, number[]>()
  for (const day of [...days].sort(compareIso)) {
    const key = `${yearOf(day)}-${monthOf(day)}`
    const bucket = byMonth.get(key)
    if (bucket) bucket.push(dayOf(day))
    else byMonth.set(key, [dayOf(day)])
  }

  return [...byMonth.entries()]
    .map(([key, monthDays]) => {
      const month = Number(key.split('-')[1])
      const ranges = dayRangesInMonth(monthDays).map(formatDayRangeInMonth).join(', ')
      return `${MONTH_NAMES[month - 1].slice(0, 3)}: ${ranges}`
    })
    .join(' · ')
}

export type DayState = 'selected' | 'aprobada' | 'pendiente' | 'festivo' | 'no-laborable' | 'libre'

export function dayState(options: {
  isSelected: boolean
  mark: DayMark
  isHoliday: boolean
  isWorkable: boolean
}): DayState {
  if (options.isSelected) return 'selected'
  if (options.mark) return options.mark
  if (options.isHoliday) return 'festivo'
  if (!options.isWorkable) return 'no-laborable'
  return 'libre'
}

export const MONTH_DAY_CLASS: Record<DayState, string> = {
  selected: 'day-selected',
  aprobada: 'day-aprobada',
  pendiente: 'day-pendiente',
  festivo: 'day-holiday',
  'no-laborable': 'day-off',
  libre: '',
}

export const GRID_DAY_CLASS: Record<DayState, string> = {
  selected: 'grid-day-selected',
  aprobada: 'grid-day-aprobada',
  pendiente: 'grid-day-pendiente',
  festivo: 'grid-day-holiday',
  'no-laborable': 'grid-day-off',
  libre: '',
}

export const STATUS_LABEL: Record<RequestStatus, string> = {
  pendiente: 'Pendiente',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
}

const MARK_TITLE = {
  aprobada: 'Vacaciones aprobadas',
  pendiente: 'Solicitud pendiente',
} as const

export function dayTitle(holiday: Holiday | undefined, mark: DayMark): string | undefined {
  if (holiday) return holiday.name
  return mark ? MARK_TITLE[mark] : undefined
}

const SCOPE_LABEL: Record<HolidayScope, string> = {
  nacional: 'Festivo nacional',
  andalucia: 'Festivo de Andalucía',
  algarrobo: 'Festivo local',
}

export interface DayInfo {
  title: string
  detail: string
}

export function dayInfo(date: IsoDate, holiday: Holiday | undefined, mark: DayMark): DayInfo {
  if (mark) return { title: MARK_TITLE[mark], detail: formatDate(date) }
  if (holiday) {
    return { title: holiday.name, detail: `${SCOPE_LABEL[holiday.scope]} · ${formatDate(date)}` }
  }

  const day = WEEKDAY_NAMES[weekday(date)]
  const named = day.charAt(0).toUpperCase() + day.slice(1)
  return { title: named, detail: `No laborable · ${formatDate(date)}` }
}

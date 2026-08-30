import { daysInMonth, isoOf, weekday } from '../domain/dates'
import type { DayMark } from './MonthCalendar'
import type { IsoDate } from '../domain/types'

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

export function monthCells(year: number, month: number): (IsoDate | null)[] {
  const first = isoOf(year, month, 1)
  const cells: (IsoDate | null)[] = Array.from({ length: columnOf(first) }, () => null)
  for (let day = 1; day <= daysInMonth(year, month); day += 1) {
    cells.push(isoOf(year, month, day))
  }
  return cells
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

export function summarizeDays(days: IsoDate[]): string {
  if (days.length === 0) return '—'
  const sorted = [...days].sort()
  const ranges: [IsoDate, IsoDate][] = []

  for (const day of sorted) {
    const last = ranges[ranges.length - 1]
    if (last && isNextCalendarDay(last[1], day)) {
      last[1] = day
    } else {
      ranges.push([day, day])
    }
  }

  return ranges
    .map(([start, end]) =>
      start === end ? formatShort(start) : `${formatShort(start)} – ${formatShort(end)}`,
    )
    .join(', ')
}

function isNextCalendarDay(previous: IsoDate, next: IsoDate): boolean {
  const gap = (Date.parse(`${next}T00:00:00Z`) - Date.parse(`${previous}T00:00:00Z`)) / 86_400_000
  return gap === 1
}

function formatShort(date: IsoDate): string {
  const [, month, day] = date.split('-').map(Number)
  return `${day} ${MONTH_NAMES[month - 1].slice(0, 3).toLowerCase()}`
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

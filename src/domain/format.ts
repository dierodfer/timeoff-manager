import { weekday } from './dates'
import type { IsoDate } from './types'
import { WEEKDAY_NAMES } from './workdays'

const DAYS_FORMAT = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 })

export function formatDays(value: number): string {
  return DAYS_FORMAT.format(value)
}

export function pluralDays(value: number): string {
  return `${formatDays(value)} ${value === 1 ? 'día' : 'días'}`
}

export function truncateDays(value: number): number {
  return Math.trunc(value)
}

export function formatDate(date: string): string {
  const [year, month, day] = date.slice(0, 10).split('-')
  return `${day}-${month}-${year}`
}

const WEEKDAY_SHORT = WEEKDAY_NAMES.map((name) => name.slice(0, 3))

/** Abreviatura de 3 letras del día de la semana («Mar», «Mié»). No pinta la fecha en sí: sigue
 * siendo formatDate() lo único que hace eso. */
export function formatWeekdayShort(date: IsoDate): string {
  const short = WEEKDAY_SHORT[weekday(date)]
  return short.charAt(0).toUpperCase() + short.slice(1)
}

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

export function roundDays(value: number): number {
  return Math.round(value * 100) / 100
}

export function formatDate(date: string): string {
  const [year, month, day] = date.slice(0, 10).split('-')
  return `${day}-${month}-${year}`
}

/** Nombre completo del día de la semana («Martes», «Miércoles»). No pinta la fecha en sí: sigue
 * siendo formatDate() lo único que hace eso. */
export function formatWeekday(date: IsoDate): string {
  const name = WEEKDAY_NAMES[weekday(date)]
  return name.charAt(0).toUpperCase() + name.slice(1)
}

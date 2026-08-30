import type { IsoDate } from './types'

// Fechas como `yyyy-MM-dd` y aritmética en UTC: con la hora local, un 1 de
// enero cambia de día según la zona horaria del navegador.

export function toUtcDate(iso: IsoDate): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

export function toIso(date: Date): IsoDate {
  return date.toISOString().slice(0, 10)
}

export function todayIso(): IsoDate {
  const now = new Date()
  return isoOf(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

export function isoOf(year: number, month: number, day: number): IsoDate {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function addDays(iso: IsoDate, amount: number): IsoDate {
  const date = toUtcDate(iso)
  date.setUTCDate(date.getUTCDate() + amount)
  return toIso(date)
}

export function weekday(iso: IsoDate): number {
  return toUtcDate(iso).getUTCDay()
}

export function yearOf(iso: IsoDate): number {
  return Number(iso.slice(0, 4))
}

export function monthOf(iso: IsoDate): number {
  return Number(iso.slice(5, 7))
}

export function dayOf(iso: IsoDate): number {
  return Number(iso.slice(8, 10))
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function yearStart(year: number): IsoDate {
  return `${year}-01-01`
}

export function yearEnd(year: number): IsoDate {
  return `${year}-12-31`
}

export function daysBetweenInclusive(start: IsoDate, end: IsoDate): number {
  const diff = toUtcDate(end).getTime() - toUtcDate(start).getTime()
  if (diff < 0) return 0
  return Math.round(diff / 86_400_000) + 1
}

export function overlapDays(
  aStart: IsoDate,
  aEnd: IsoDate,
  bStart: IsoDate,
  bEnd: IsoDate,
): number {
  const start = aStart > bStart ? aStart : bStart
  const end = aEnd < bEnd ? aEnd : bEnd
  return daysBetweenInclusive(start, end)
}

export function expandRange(start: IsoDate, end: IsoDate): IsoDate[] {
  const [from, to] = start <= end ? [start, end] : [end, start]
  const dates: IsoDate[] = []
  for (let cursor = from; cursor <= to; cursor = addDays(cursor, 1)) {
    dates.push(cursor)
  }
  return dates
}

export function compareIso(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0
}

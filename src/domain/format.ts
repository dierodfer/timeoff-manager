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

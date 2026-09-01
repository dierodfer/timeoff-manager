import { describe, expect, it } from 'vitest'
import { formatDate, formatDays, pluralDays, truncateDays } from './format'

describe('formatDate', () => {
  it('reordena yyyy-MM-dd a dd-mm-aaaa', () => {
    expect(formatDate('2026-01-05')).toBe('05-01-2026')
  })

  it('conserva el cero inicial del día y del mes', () => {
    expect(formatDate('2026-03-09')).toBe('09-03-2026')
  })

  it('acepta una marca de tiempo ISO completa, ignorando la hora', () => {
    expect(formatDate('2026-12-25T10:30:00.000Z')).toBe('25-12-2026')
  })
})

describe('formatDays', () => {
  it('formatea con coma decimal y hasta dos decimales', () => {
    expect(formatDays(23)).toBe('23')
    expect(formatDays(22.92)).toBe('22,92')
  })
})

describe('pluralDays', () => {
  it('usa singular solo para 1', () => {
    expect(pluralDays(1)).toBe('1 día')
    expect(pluralDays(2)).toBe('2 días')
    expect(pluralDays(0)).toBe('0 días')
  })
})

describe('truncateDays', () => {
  it('corta los decimales sin redondear', () => {
    expect(truncateDays(15.9999)).toBe(15)
    expect(truncateDays(22.92)).toBe(22)
  })

  it('no toca un valor ya entero', () => {
    expect(truncateDays(23)).toBe(23)
    expect(truncateDays(0)).toBe(0)
  })
})

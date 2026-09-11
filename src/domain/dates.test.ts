import { describe, expect, it } from 'vitest'
import {
  addDays,
  compareIso,
  dayOf,
  daysBetweenInclusive,
  daysInMonth,
  daysInYear,
  expandRange,
  isLeapYear,
  isoOf,
  monthOf,
  overlapDays,
  toIso,
  todayIso,
  toUtcDate,
  weekday,
  yearEnd,
  yearOf,
  yearStart,
} from './dates'

// La suite entera corre en una zona horaria con desfase negativo (ver vite.config.ts):
// es la que rompe la aritmética de fechas si alguien vuelve a la hora local, porque ahí
// `new Date(2026, 0, 1).toISOString()` cae en el 31 de diciembre del año anterior.

describe('conversión entre cadena y Date', () => {
  it('interpreta la fecha en UTC, no en la hora local', () => {
    expect(toUtcDate('2026-01-01').toISOString()).toBe('2026-01-01T00:00:00.000Z')
    expect(toUtcDate('2026-12-31').toISOString()).toBe('2026-12-31T00:00:00.000Z')
  })

  it('va y vuelve sin desplazarse de día', () => {
    for (const iso of ['2026-01-01', '2026-06-15', '2026-12-31', '2024-02-29']) {
      expect(toIso(toUtcDate(iso))).toBe(iso)
    }
  })

  it('isoOf rellena mes y día con ceros', () => {
    expect(isoOf(2026, 1, 1)).toBe('2026-01-01')
    expect(isoOf(2026, 12, 31)).toBe('2026-12-31')
    expect(isoOf(2026, 9, 5)).toBe('2026-09-05')
  })

  it('todayIso usa el día del calendario local, que es el que ve el usuario', () => {
    const now = new Date()
    expect(todayIso()).toBe(isoOf(now.getFullYear(), now.getMonth() + 1, now.getDate()))
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('addDays', () => {
  it('suma dentro del mismo mes', () => {
    expect(addDays('2026-09-10', 5)).toBe('2026-09-15')
  })

  it('cruza el fin de mes y el fin de año', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('resta con cantidades negativas', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('cuenta el 29 de febrero en un año bisiesto', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDays('2024-02-29', 1)).toBe('2024-03-01')
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
  })

  it('no se salta ni repite días al cruzar un cambio de hora', () => {
    // Último domingo de marzo y de octubre en Europa; en América, el segundo domingo
    // de marzo y el primero de noviembre. Con aritmética local, uno de estos falla.
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29')
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30')
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25')
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26')
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02')
  })

  it('sumar cero deja la fecha igual', () => {
    expect(addDays('2026-09-10', 0)).toBe('2026-09-10')
  })
})

describe('partes de una fecha', () => {
  it('extrae año, mes y día', () => {
    expect(yearOf('2026-09-05')).toBe(2026)
    expect(monthOf('2026-09-05')).toBe(9)
    expect(dayOf('2026-09-05')).toBe(5)
  })

  it('weekday devuelve 0 para domingo y 6 para sábado, como Settings.workweek', () => {
    expect(weekday('2026-09-06')).toBe(0) // domingo
    expect(weekday('2026-09-07')).toBe(1) // lunes
    expect(weekday('2026-09-12')).toBe(6) // sábado
  })

  it('yearStart y yearEnd cubren el año entero', () => {
    expect(yearStart(2026)).toBe('2026-01-01')
    expect(yearEnd(2026)).toBe('2026-12-31')
  })
})

describe('años bisiestos', () => {
  it('aplica la regla completa, incluidos los múltiplos de 100 y 400', () => {
    expect(isLeapYear(2024)).toBe(true)
    expect(isLeapYear(2026)).toBe(false)
    expect(isLeapYear(1900)).toBe(false) // múltiplo de 100 pero no de 400
    expect(isLeapYear(2000)).toBe(true) // múltiplo de 400
    expect(isLeapYear(2100)).toBe(false)
  })

  it('daysInYear va acorde', () => {
    expect(daysInYear(2024)).toBe(366)
    expect(daysInYear(2026)).toBe(365)
    expect(daysInYear(1900)).toBe(365)
    expect(daysInYear(2000)).toBe(366)
  })
})

describe('daysInMonth', () => {
  it('da los días de cada mes con el mes en base 1', () => {
    expect(daysInMonth(2026, 1)).toBe(31)
    expect(daysInMonth(2026, 4)).toBe(30)
    expect(daysInMonth(2026, 9)).toBe(30)
    expect(daysInMonth(2026, 12)).toBe(31)
  })

  it('ajusta febrero según el año', () => {
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2024, 2)).toBe(29)
    expect(daysInMonth(1900, 2)).toBe(28)
    expect(daysInMonth(2000, 2)).toBe(29)
  })

  it('la suma de los doce meses cuadra con el año', () => {
    for (const year of [2024, 2026]) {
      const total = Array.from({ length: 12 }, (_, index) => daysInMonth(year, index + 1)).reduce(
        (sum, days) => sum + days,
        0,
      )
      expect(total).toBe(daysInYear(year))
    }
  })
})

describe('daysBetweenInclusive', () => {
  it('cuenta los dos extremos', () => {
    expect(daysBetweenInclusive('2026-09-07', '2026-09-07')).toBe(1)
    expect(daysBetweenInclusive('2026-09-07', '2026-09-08')).toBe(2)
  })

  it('devuelve 0 si el rango está al revés, en vez de un número negativo', () => {
    expect(daysBetweenInclusive('2026-09-08', '2026-09-07')).toBe(0)
  })

  it('cuenta un año entero y uno bisiesto', () => {
    expect(daysBetweenInclusive('2026-01-01', '2026-12-31')).toBe(365)
    expect(daysBetweenInclusive('2024-01-01', '2024-12-31')).toBe(366)
  })

  it('no se descuadra al cruzar un cambio de hora', () => {
    // Con horas locales, la semana del cambio tiene un día de 23 h y otro de 25 h,
    // y el redondeo del cociente se iría a 6 u 8 días en vez de 7.
    expect(daysBetweenInclusive('2026-03-23', '2026-03-29')).toBe(7)
    expect(daysBetweenInclusive('2026-10-19', '2026-10-25')).toBe(7)
    expect(daysBetweenInclusive('2026-03-08', '2026-03-14')).toBe(7)
    expect(daysBetweenInclusive('2026-11-01', '2026-11-07')).toBe(7)
  })
})

describe('overlapDays', () => {
  it('cuenta los días compartidos por dos tramos', () => {
    expect(overlapDays('2026-01-01', '2026-01-10', '2026-01-05', '2026-01-20')).toBe(6)
  })

  it('devuelve 0 cuando no se tocan', () => {
    expect(overlapDays('2026-01-01', '2026-01-10', '2026-02-01', '2026-02-10')).toBe(0)
  })

  it('devuelve 1 cuando solo comparten un día', () => {
    expect(overlapDays('2026-01-01', '2026-01-10', '2026-01-10', '2026-01-20')).toBe(1)
  })

  it('un tramo contenido en otro cuenta entero', () => {
    expect(overlapDays('2026-01-01', '2026-12-31', '2026-06-01', '2026-06-30')).toBe(30)
    expect(overlapDays('2026-06-01', '2026-06-30', '2026-01-01', '2026-12-31')).toBe(30)
  })

  it('es simétrico', () => {
    const a = overlapDays('2026-03-01', '2026-03-20', '2026-03-15', '2026-04-05')
    const b = overlapDays('2026-03-15', '2026-04-05', '2026-03-01', '2026-03-20')
    expect(a).toBe(b)
  })
})

describe('expandRange', () => {
  it('devuelve todos los días, extremos incluidos', () => {
    expect(expandRange('2026-09-07', '2026-09-10')).toEqual([
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
    ])
  })

  it('un solo día devuelve ese día', () => {
    expect(expandRange('2026-09-07', '2026-09-07')).toEqual(['2026-09-07'])
  })

  it('acepta el rango al revés y lo ordena', () => {
    expect(expandRange('2026-09-10', '2026-09-07')).toEqual(expandRange('2026-09-07', '2026-09-10'))
  })

  it('cruza el fin de año', () => {
    expect(expandRange('2026-12-30', '2027-01-02')).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ])
  })

  it('su longitud coincide siempre con daysBetweenInclusive', () => {
    const casos: [string, string][] = [
      ['2026-01-01', '2026-12-31'],
      ['2024-02-01', '2024-03-01'],
      ['2026-03-23', '2026-03-29'],
      ['2026-10-19', '2026-10-25'],
    ]
    for (const [start, end] of casos) {
      expect(expandRange(start, end)).toHaveLength(daysBetweenInclusive(start, end))
    }
  })
})

describe('compareIso', () => {
  it('ordena cronológicamente', () => {
    expect(compareIso('2026-01-01', '2026-01-02')).toBeLessThan(0)
    expect(compareIso('2026-01-02', '2026-01-01')).toBeGreaterThan(0)
    expect(compareIso('2026-01-01', '2026-01-01')).toBe(0)
  })

  it('sirve como comparador de sort', () => {
    const desordenadas = ['2026-12-31', '2026-01-01', '2027-01-01', '2026-06-15']
    expect([...desordenadas].sort(compareIso)).toEqual([
      '2026-01-01',
      '2026-06-15',
      '2026-12-31',
      '2027-01-01',
    ])
  })
})

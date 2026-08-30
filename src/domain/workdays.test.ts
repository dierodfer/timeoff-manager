import { describe, expect, it } from 'vitest'
import { preloadedHolidays } from './holidays.es'
import { testSettings } from './fixtures'
import { buildWorkCalendar, isWorkingDay, workingDaysInRange } from './workdays'

const calendar = buildWorkCalendar(preloadedHolidays(2026), testSettings)

describe('calendario laboral de lunes a sábado', () => {
  it('cuenta el sábado como laborable y el domingo no', () => {
    expect(isWorkingDay(calendar, '2026-04-04')).toBe(true) // sábado
    expect(isWorkingDay(calendar, '2026-04-05')).toBe(false) // domingo
  })

  it('descarta los festivos aunque caigan en día laborable', () => {
    expect(isWorkingDay(calendar, '2026-04-02')).toBe(false) // Jueves Santo
    expect(isWorkingDay(calendar, '2026-08-03')).toBe(false) // fiesta local, lunes
    expect(isWorkingDay(calendar, '2026-08-15')).toBe(false) // Asunción, sábado
  })

  it('filtra domingos y festivos de un rango', () => {
    // Del miércoles 1 al lunes 6 de abril: el 2 y el 3 son festivos y el 5 es domingo.
    expect(workingDaysInRange(calendar, '2026-04-01', '2026-04-06')).toEqual([
      '2026-04-01',
      '2026-04-04',
      '2026-04-06',
    ])
  })

  it('cuenta 14 festivos oficiales en 2026 para Algarrobo', () => {
    expect(preloadedHolidays(2026)).toHaveLength(14)
  })
})

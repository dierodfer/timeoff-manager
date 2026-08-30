import { describe, expect, it } from 'vitest'
import { activeDaysInYear, effectiveAnnualDays, estimateAnnualDays } from './accrual'
import { makeEmployee, testSettings } from './fixtures'

const BASE = testSettings.defaultAnnualDays // 23

describe('estimación de días de vacaciones', () => {
  it('asigna la base completa a quien trabaja el año entero', () => {
    expect(estimateAnnualDays(makeEmployee(), 2026, BASE)).toBe(BASE)
  })

  it('prorratea a quien se da de alta a mitad de año', () => {
    const employee = makeEmployee({ hireDate: '2026-07-01' })
    expect(activeDaysInYear(employee, 2026)).toBe(184)
    expect(estimateAnnualDays(employee, 2026, BASE)).toBe(12)
  })

  it('prorratea a quien causa baja durante el año', () => {
    const employee = makeEmployee({ terminationDate: '2026-06-30' })
    expect(activeDaysInYear(employee, 2026)).toBe(181)
    expect(estimateAnnualDays(employee, 2026, BASE)).toBe(11)
  })

  it('no asigna días fuera de la relación laboral', () => {
    const employee = makeEmployee({ hireDate: '2027-01-01' })
    expect(estimateAnnualDays(employee, 2026, BASE)).toBe(0)
  })

  describe('fijo discontinuo', () => {
    it('suma solo sus periodos de llamamiento', () => {
      const employee = makeEmployee({
        isSeasonal: true,
        activityPeriods: [
          { id: 'p1', start: '2026-03-01', end: '2026-09-30' }, // 214 días
          { id: 'p2', start: '2026-12-01', end: '2026-12-31' }, // 31 días
        ],
      })
      expect(activeDaysInYear(employee, 2026)).toBe(245)
      expect(estimateAnnualDays(employee, 2026, BASE)).toBe(15)
    })

    it('no cuenta dos veces los periodos solapados', () => {
      const employee = makeEmployee({
        isSeasonal: true,
        activityPeriods: [
          { id: 'p1', start: '2026-03-01', end: '2026-06-30' },
          { id: 'p2', start: '2026-06-01', end: '2026-09-30' },
        ],
      })
      expect(activeDaysInYear(employee, 2026)).toBe(214)
    })

    it('recorta los periodos al año consultado', () => {
      const employee = makeEmployee({
        isSeasonal: true,
        activityPeriods: [{ id: 'p1', start: '2025-12-01', end: '2026-01-31' }],
      })
      expect(activeDaysInYear(employee, 2026)).toBe(31)
    })
  })
})

describe('días efectivos', () => {
  it('usa la estimación cuando no hay ajuste manual', () => {
    const employee = makeEmployee({ hireDate: '2026-07-01' })
    expect(effectiveAnnualDays(employee, 2026, BASE, [])).toBe(12)
  })

  it('el ajuste del administrador tiene prioridad sobre la estimación', () => {
    const employee = makeEmployee({ hireDate: '2026-07-01' })
    const allowances = [{ employeeId: employee.id, year: 2026, days: 18 }]
    expect(effectiveAnnualDays(employee, 2026, BASE, allowances)).toBe(18)
  })

  it('el ajuste solo afecta al año para el que se hizo', () => {
    const employee = makeEmployee()
    const allowances = [{ employeeId: employee.id, year: 2026, days: 30 }]
    expect(effectiveAnnualDays(employee, 2027, BASE, allowances)).toBe(BASE)
  })
})

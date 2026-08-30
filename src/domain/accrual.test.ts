import { describe, expect, it } from 'vitest'
import {
  ACCRUAL_PER_WORKED_DAY,
  effectiveAnnualDays,
  estimateAnnualDays,
  workedDaysInYear,
} from './accrual'
import { makeEmployee, testSettings } from './fixtures'

// Fecha fija: la proyección del periodo en curso depende de «hoy».
const TODAY = '2026-06-15'
const WORKWEEK = testSettings.workweek // lunes a sábado

const worked = (employee: ReturnType<typeof makeEmployee>, year = 2026) =>
  workedDaysInYear(employee, year, WORKWEEK, TODAY)
const estimate = (employee: ReturnType<typeof makeEmployee>, year = 2026) =>
  estimateAnnualDays(employee, year, testSettings, TODAY)

describe('días trabajados', () => {
  it('cuenta los días de la jornada semanal, sin domingos', () => {
    // 2026 tiene 365 días y 52 domingos: 313 días de lunes a sábado.
    expect(worked(makeEmployee())).toBe(313)
  })

  it('no descuenta los festivos', () => {
    // La base anual se define sobre los días de jornada, no sobre los
    // efectivamente trabajados, así que los 14 festivos siguen contando.
    expect(worked(makeEmployee())).toBeGreaterThan(300)
  })

  it('respeta una jornada semanal más corta', () => {
    const employee = makeEmployee()
    expect(workedDaysInYear(employee, 2026, [1, 2, 3, 4, 5], TODAY)).toBe(261)
  })
})

describe('estimación a 0,0737 por día trabajado', () => {
  it('un año completo queda en la base anual por el tope', () => {
    // 313 días × 0,0737 = 23,0681, algo por encima de la base de 23: el tope
    // lo deja justo en la base.
    expect(313 * ACCRUAL_PER_WORKED_DAY).toBeGreaterThan(testSettings.defaultAnnualDays)
    expect(estimate(makeEmployee())).toBe(testSettings.defaultAnnualDays)
  })

  it('no redondea: el resultado es decimal', () => {
    const employee = makeEmployee({ hireDate: '2026-07-01' })
    const days = estimate(employee)
    expect(Number.isInteger(days)).toBe(false)
    expect(days).toBeCloseTo(worked(employee) * ACCRUAL_PER_WORKED_DAY, 6)
  })

  it('prorratea a quien se da de alta a mitad de año', () => {
    const employee = makeEmployee({ hireDate: '2026-07-01' })
    expect(worked(employee)).toBe(158)
    expect(estimate(employee)).toBeCloseTo(11.6446, 4)
  })

  it('no asigna días fuera de la relación laboral', () => {
    expect(estimate(makeEmployee({ hireDate: '2027-01-01' }))).toBe(0)
  })

  it('limita la estimación a la base anual', () => {
    const settings = { ...testSettings, defaultAnnualDays: 10 }
    expect(estimateAnnualDays(makeEmployee(), 2026, settings, TODAY)).toBe(10)
  })
})

describe('fijo discontinuo', () => {
  it('suma los periodos ya cerrados del año', () => {
    const employee = makeEmployee({
      isSeasonal: true,
      activityPeriods: [{ id: 'p1', start: '2026-01-05', end: '2026-02-28' }],
    })
    // Periodo cerrado antes de TODAY: cuenta sus días tal cual.
    expect(worked(employee)).toBe(48)
    expect(estimate(employee)).toBeCloseTo(48 * ACCRUAL_PER_WORKED_DAY, 6)
  })

  it('proyecta hasta fin de año el periodo en curso', () => {
    const enCurso = makeEmployee({
      isSeasonal: true,
      activityPeriods: [{ id: 'p1', start: '2026-03-01', end: '2026-09-30' }],
    })
    const yaCerrado = makeEmployee({
      isSeasonal: true,
      activityPeriods: [{ id: 'p1', start: '2026-03-01', end: '2026-05-31' }],
    })
    // TODAY cae dentro del primero, así que se extiende al 31 de diciembre.
    expect(worked(enCurso)).toBe(worked(makeEmployee({ hireDate: '2026-03-01' })))
    expect(worked(yaCerrado)).toBeLessThan(worked(enCurso))
  })

  it('suma periodos anteriores y el proyectado sin contar dos veces', () => {
    const employee = makeEmployee({
      isSeasonal: true,
      activityPeriods: [
        { id: 'p1', start: '2026-01-05', end: '2026-02-28' },
        { id: 'p2', start: '2026-06-01', end: '2026-07-31' },
      ],
    })
    const cerrado = 48
    const proyectado = 184 // 1 de junio al 31 de diciembre
    expect(worked(employee)).toBe(cerrado + proyectado)
  })

  it('no cuenta dos veces los periodos solapados', () => {
    const employee = makeEmployee({
      isSeasonal: true,
      activityPeriods: [
        { id: 'p1', start: '2026-01-05', end: '2026-02-28' },
        { id: 'p2', start: '2026-02-01', end: '2026-02-20' },
      ],
    })
    expect(worked(employee)).toBe(48)
  })

  it('recorta los periodos al año consultado', () => {
    const employee = makeEmployee({
      isSeasonal: true,
      activityPeriods: [{ id: 'p1', start: '2025-12-01', end: '2026-01-31' }],
    })
    expect(worked(employee)).toBe(27)
  })
})

describe('días efectivos', () => {
  it('usa la estimación cuando no hay ajuste manual', () => {
    const employee = makeEmployee({ hireDate: '2026-07-01' })
    expect(effectiveAnnualDays(employee, 2026, testSettings, [], TODAY)).toBeCloseTo(11.6446, 4)
  })

  it('el ajuste del administrador tiene prioridad sobre la estimación', () => {
    const employee = makeEmployee({ hireDate: '2026-07-01' })
    const allowances = [{ employeeId: employee.id, year: 2026, days: 18 }]
    expect(effectiveAnnualDays(employee, 2026, testSettings, allowances, TODAY)).toBe(18)
  })

  it('el ajuste solo afecta al año para el que se hizo', () => {
    const allowances = [{ employeeId: 'emp-1', year: 2026, days: 30 }]
    expect(effectiveAnnualDays(makeEmployee(), 2027, testSettings, allowances, TODAY)).toBe(
      testSettings.defaultAnnualDays,
    )
  })
})

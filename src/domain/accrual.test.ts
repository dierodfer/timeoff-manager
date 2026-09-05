import { describe, expect, it } from 'vitest'
import {
  ACCRUAL_PER_WORKED_DAY,
  activityIntervalsInYear,
  effectiveAnnualDays,
  estimateAnnualDays,
  hasOverlap,
  isActive,
  isActiveInYear,
  periodsOverlap,
  workedDaysInYear,
} from './accrual'
import { makeEmployee, makePeriod, testSettings } from './fixtures'

const TODAY = '2026-06-15'
const WORKWEEK = testSettings.workweek // lunes a sábado

const worked = (employee: ReturnType<typeof makeEmployee>, year = 2026) =>
  workedDaysInYear(employee, year, WORKWEEK)
const estimate = (employee: ReturnType<typeof makeEmployee>, year = 2026) =>
  estimateAnnualDays(employee, year, testSettings)

describe('hasOverlap', () => {
  it('no detecta solape entre periodos separados', () => {
    expect(
      hasOverlap([
        { start: '2026-01-05', end: '2026-01-31' },
        { start: '2026-02-01', end: '2026-02-28' },
      ]),
    ).toBe(false)
  })

  it('detecta el solape aunque sea de un solo día', () => {
    expect(
      hasOverlap([
        { start: '2026-01-05', end: '2026-01-20' },
        { start: '2026-01-20', end: '2026-02-28' },
      ]),
    ).toBe(true)
  })

  it('detecta un periodo contenido dentro de otro', () => {
    expect(
      hasOverlap([
        { start: '2026-01-01', end: '2026-12-31' },
        { start: '2026-06-01', end: '2026-06-30' },
      ]),
    ).toBe(true)
  })

  it('no falla con un único periodo o ninguno', () => {
    expect(hasOverlap([])).toBe(false)
    expect(hasOverlap([{ start: '2026-01-01', end: '2026-01-31' }])).toBe(false)
  })
})

describe('periodsOverlap', () => {
  it('el periodo en curso se solapa con todo lo posterior a su inicio', () => {
    expect(periodsOverlap([makePeriod('2026-01-01'), makePeriod('2026-06-01', '2026-06-30')])).toBe(
      true,
    )
  })

  it('no hay solape si el periodo en curso empieza después de que acabe el anterior', () => {
    expect(periodsOverlap([makePeriod('2026-01-01', '2026-05-31'), makePeriod('2026-06-01')])).toBe(
      false,
    )
  })
})

describe('activityIntervalsInYear', () => {
  it('recorta el periodo en curso al 31 de diciembre', () => {
    expect(activityIntervalsInYear(makeEmployee(), 2026)).toEqual([
      { start: '2026-01-01', end: '2026-12-31' },
    ])
  })

  it('deja fuera los periodos de otros años', () => {
    const employee = makeEmployee({ activityPeriods: [makePeriod('2025-01-01', '2025-12-31')] })
    expect(activityIntervalsInYear(employee, 2026)).toEqual([])
  })

  it('devuelve un tramo por cada periodo del año', () => {
    const employee = makeEmployee({
      activityPeriods: [
        makePeriod('2026-01-01', '2026-03-31'),
        makePeriod('2026-09-01', '2026-10-31'),
      ],
    })
    expect(activityIntervalsInYear(employee, 2026)).toEqual([
      { start: '2026-01-01', end: '2026-03-31' },
      { start: '2026-09-01', end: '2026-10-31' },
    ])
  })

  it('fusiona los periodos solapados', () => {
    const employee = makeEmployee({
      activityPeriods: [
        makePeriod('2026-01-05', '2026-02-28'),
        makePeriod('2026-02-01', '2026-03-15'),
      ],
    })
    expect(activityIntervalsInYear(employee, 2026)).toEqual([
      { start: '2026-01-05', end: '2026-03-15' },
    ])
  })
})

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
    expect(workedDaysInYear(makeEmployee(), 2026, [1, 2, 3, 4, 5])).toBe(261)
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
    const employee = makeEmployee({ activityPeriods: [makePeriod('2026-07-01')] })
    const days = estimate(employee)
    expect(Number.isInteger(days)).toBe(false)
    expect(days).toBeCloseTo(worked(employee) * ACCRUAL_PER_WORKED_DAY, 6)
  })

  it('prorratea a quien se da de alta a mitad de año', () => {
    const employee = makeEmployee({ activityPeriods: [makePeriod('2026-07-01')] })
    expect(worked(employee)).toBe(158)
    expect(estimate(employee)).toBeCloseTo(11.6446, 4)
  })

  it('no asigna días fuera de la relación laboral', () => {
    expect(estimate(makeEmployee({ activityPeriods: [makePeriod('2027-01-01')] }))).toBe(0)
  })

  it('limita la estimación a la base anual', () => {
    const settings = { ...testSettings, defaultAnnualDays: 10 }
    expect(estimateAnnualDays(makeEmployee(), 2026, settings)).toBe(10)
  })
})

describe('varios periodos de actividad en un mismo año', () => {
  it('suma los dos tramos de quien se da de baja y vuelve', () => {
    const readmitido = makeEmployee({
      activityPeriods: [makePeriod('2026-01-01', '2026-03-31'), makePeriod('2026-09-01')],
    })
    const primerTramo = makeEmployee({
      activityPeriods: [makePeriod('2026-01-01', '2026-03-31')],
    })
    const segundoTramo = makeEmployee({ activityPeriods: [makePeriod('2026-09-01')] })

    expect(worked(readmitido)).toBe(worked(primerTramo) + worked(segundoTramo))
  })

  it('no cuenta el hueco entre dos periodos', () => {
    const conHueco = makeEmployee({
      activityPeriods: [makePeriod('2026-01-01', '2026-03-31'), makePeriod('2026-09-01')],
    })
    const sinHueco = makeEmployee({ activityPeriods: [makePeriod('2026-01-01')] })
    expect(worked(conHueco)).toBeLessThan(worked(sinHueco))
  })
})

describe('fijo discontinuo', () => {
  it('suma los periodos ya cerrados del año', () => {
    const employee = makeEmployee({
      isSeasonal: true,
      activityPeriods: [makePeriod('2026-01-05', '2026-02-28')],
    })
    expect(worked(employee)).toBe(48)
    expect(estimate(employee)).toBeCloseTo(48 * ACCRUAL_PER_WORKED_DAY, 6)
  })

  it('el periodo en curso llega hasta fin de año', () => {
    const enCurso = makeEmployee({ isSeasonal: true, activityPeriods: [makePeriod('2026-03-01')] })
    const yaCerrado = makeEmployee({
      isSeasonal: true,
      activityPeriods: [makePeriod('2026-03-01', '2026-05-31')],
    })
    expect(worked(enCurso)).toBe(
      worked(makeEmployee({ activityPeriods: [makePeriod('2026-03-01')] })),
    )
    expect(worked(yaCerrado)).toBeLessThan(worked(enCurso))
  })

  it('suma los llamamientos anteriores y el que sigue en curso', () => {
    const employee = makeEmployee({
      isSeasonal: true,
      activityPeriods: [makePeriod('2026-01-05', '2026-02-28'), makePeriod('2026-06-01')],
    })
    const cerrado = 48
    const enCurso = 184 // 1 de junio al 31 de diciembre
    expect(worked(employee)).toBe(cerrado + enCurso)
  })

  it('no cuenta dos veces los periodos solapados', () => {
    const employee = makeEmployee({
      isSeasonal: true,
      activityPeriods: [
        makePeriod('2026-01-05', '2026-02-28'),
        makePeriod('2026-02-01', '2026-02-20'),
      ],
    })
    expect(worked(employee)).toBe(48)
  })

  it('recorta los periodos al año consultado', () => {
    const employee = makeEmployee({
      isSeasonal: true,
      activityPeriods: [makePeriod('2025-12-01', '2026-01-31')],
    })
    expect(worked(employee)).toBe(27)
  })
})

describe('actividad hoy y en el año', () => {
  it('un periodo abierto que ya ha empezado está en activo', () => {
    expect(isActive(makeEmployee(), TODAY)).toBe(true)
  })

  it('una baja programada a futuro sigue en activo hasta que llega', () => {
    const employee = makeEmployee({ activityPeriods: [makePeriod('2026-01-01', '2026-12-31')] })
    expect(isActive(employee, TODAY)).toBe(true)
  })

  it('un alta programada a futuro todavía no está en activo, pero sí cuenta en el año', () => {
    const employee = makeEmployee({
      activityPeriods: [makePeriod('2026-01-01', '2026-03-31'), makePeriod('2026-09-01')],
    })
    expect(isActive(employee, TODAY)).toBe(false)
    expect(isActiveInYear(employee, 2026)).toBe(true)
  })

  it('sin ningún periodo en el año no hay actividad', () => {
    const employee = makeEmployee({ activityPeriods: [makePeriod('2025-01-01', '2025-12-31')] })
    expect(isActiveInYear(employee, 2026)).toBe(false)
  })
})

describe('días efectivos', () => {
  it('usa la estimación cuando no hay ajuste manual', () => {
    const employee = makeEmployee({ activityPeriods: [makePeriod('2026-07-01')] })
    expect(effectiveAnnualDays(employee, 2026, testSettings, [])).toBeCloseTo(11.6446, 4)
  })

  it('el ajuste del administrador tiene prioridad sobre la estimación', () => {
    const employee = makeEmployee({ activityPeriods: [makePeriod('2026-07-01')] })
    const allowances = [{ employeeId: employee.id, year: 2026, days: 18 }]
    expect(effectiveAnnualDays(employee, 2026, testSettings, allowances)).toBe(18)
  })

  it('el ajuste solo afecta al año para el que se hizo', () => {
    const allowances = [{ employeeId: 'emp-1', year: 2026, days: 30 }]
    expect(effectiveAnnualDays(makeEmployee(), 2027, testSettings, allowances)).toBe(
      testSettings.defaultAnnualDays,
    )
  })
})

import { describe, expect, it } from 'vitest'
import {
  activityIntervalsInYear,
  altaDaysInYear,
  effectiveAnnualDays,
  estimateAnnualDays,
  hasOverlap,
  isActive,
  isActiveInYear,
  periodsOverlap,
  workedDaysBreakdown,
} from './accrual'
import type { Holiday } from './types'
import { buildWorkCalendar } from './workdays'
import { makeEmployee, makePeriod, testSettings } from './fixtures'

const TODAY = '2026-06-15'
const CALENDAR = buildWorkCalendar([], testSettings)

const alta = (employee: ReturnType<typeof makeEmployee>, year = 2026) =>
  altaDaysInYear(employee, year)
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

describe('altaDaysInYear', () => {
  it('cuenta los días naturales del año entero, domingos incluidos', () => {
    expect(alta(makeEmployee())).toBe(365)
  })

  it('un año ya terminado cuenta entero', () => {
    const employee = makeEmployee({ activityPeriods: [makePeriod('2025-01-01')] })
    expect(alta(employee, 2025)).toBe(365)
  })

  it('un periodo que todavía no ha empezado en el año no suma nada', () => {
    expect(alta(makeEmployee({ activityPeriods: [makePeriod('2027-01-01')] }))).toBe(0)
  })
})

describe('workedDaysBreakdown', () => {
  const breakdown = (employee: ReturnType<typeof makeEmployee>, until = TODAY) =>
    workedDaysBreakdown(employee, 2026, CALENDAR, until)

  it('cuenta solo hasta `until`, sin llegar al año entero', () => {
    // Del 1 de enero al 15 de junio: 166 días menos 24 domingos.
    expect(breakdown(makeEmployee()).total).toBe(142)
    expect(breakdown(makeEmployee()).total).toBeLessThan(
      breakdown(makeEmployee(), '2026-12-31').total,
    )
  })

  it('un periodo que todavía no ha empezado no suma nada', () => {
    expect(breakdown(makeEmployee({ activityPeriods: [makePeriod('2026-09-01')] })).total).toBe(0)
  })

  it('descuenta los festivos que caen en día laborable', () => {
    const holidays: Holiday[] = [
      { id: 'h1', date: '2026-01-01', name: 'Año Nuevo', scope: 'nacional' },
      { id: 'h2', date: '2026-01-04', name: 'Domingo festivo', scope: 'nacional' },
    ]
    const calendar = buildWorkCalendar(holidays, testSettings)
    const withHolidays = workedDaysBreakdown(makeEmployee(), 2026, calendar, TODAY)
    const withoutHolidays = workedDaysBreakdown(makeEmployee(), 2026, CALENDAR, TODAY)

    // El 4 de enero de 2026 es domingo (no laborable): solo cuenta el 1 de enero.
    expect(withHolidays.total).toBe(withoutHolidays.total - 1)
    expect(withHolidays.holidays.map((h) => h.id)).toEqual(['h1'])
  })

  it('nunca da negativo: un festivo en el primer día de alta cuenta 0, no −1', () => {
    const holidays: Holiday[] = [
      { id: 'h1', date: '2026-01-01', name: 'Año Nuevo', scope: 'nacional' },
    ]
    const calendar = buildWorkCalendar(holidays, testSettings)
    expect(workedDaysBreakdown(makeEmployee(), 2026, calendar, '2026-01-01').total).toBe(0)
  })

  it('un tramo por periodo de actividad, con su rango', () => {
    const employee = makeEmployee({
      activityPeriods: [makePeriod('2026-01-05', '2026-02-28'), makePeriod('2026-09-01')],
    })
    expect(breakdown(employee, '2026-12-31').ranges).toEqual([
      { start: '2026-01-05', end: '2026-02-28', days: 48 },
      { start: '2026-09-01', end: '2026-12-31', days: 105 },
    ])
  })
})

describe('estimación proporcional a los días de alta', () => {
  it('un año completo da la base anual entera', () => {
    expect(estimate(makeEmployee())).toBe(testSettings.defaultAnnualDays)
  })

  it('se redondea a 2 decimales', () => {
    const employee = makeEmployee({ activityPeriods: [makePeriod('2026-07-01')] })
    const days = estimate(employee)
    expect(Number.isInteger(days)).toBe(false)
    expect(days).toBe(Math.round(days * 100) / 100)
  })

  it('prorratea a quien se da de alta a mitad de año: días de alta × 23 / 365', () => {
    const employee = makeEmployee({ activityPeriods: [makePeriod('2026-07-01')] })
    expect(alta(employee)).toBe(184)
    expect(estimate(employee)).toBeCloseTo((184 * 23) / 365, 2)
  })

  it('no asigna días fuera de la relación laboral', () => {
    expect(estimate(makeEmployee({ activityPeriods: [makePeriod('2027-01-01')] }))).toBe(0)
  })

  it('nunca supera la base anual, sin necesidad de un tope aparte', () => {
    const settings = { ...testSettings, defaultAnnualDays: 10 }
    expect(estimateAnnualDays(makeEmployee(), 2026, settings)).toBe(10)
  })

  it('un año bisiesto reparte sobre 366 días', () => {
    const employee = makeEmployee({ activityPeriods: [makePeriod('2028-01-01')] })
    expect(estimateAnnualDays(employee, 2028, testSettings)).toBe(testSettings.defaultAnnualDays)
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

    expect(alta(readmitido)).toBe(alta(primerTramo) + alta(segundoTramo))
  })

  it('no cuenta el hueco entre dos periodos', () => {
    const conHueco = makeEmployee({
      activityPeriods: [makePeriod('2026-01-01', '2026-03-31'), makePeriod('2026-09-01')],
    })
    const sinHueco = makeEmployee({ activityPeriods: [makePeriod('2026-01-01')] })
    expect(alta(conHueco)).toBeLessThan(alta(sinHueco))
  })
})

describe('fijo discontinuo', () => {
  it('suma los periodos ya cerrados del año', () => {
    const employee = makeEmployee({
      isSeasonal: true,
      activityPeriods: [makePeriod('2026-01-05', '2026-02-28')],
    })
    expect(alta(employee)).toBe(55)
    expect(estimate(employee)).toBeCloseTo((55 * 23) / 365, 2)
  })

  it('el periodo en curso llega hasta fin de año', () => {
    const enCurso = makeEmployee({ isSeasonal: true, activityPeriods: [makePeriod('2026-03-01')] })
    const yaCerrado = makeEmployee({
      isSeasonal: true,
      activityPeriods: [makePeriod('2026-03-01', '2026-05-31')],
    })
    expect(alta(enCurso)).toBe(alta(makeEmployee({ activityPeriods: [makePeriod('2026-03-01')] })))
    expect(alta(yaCerrado)).toBeLessThan(alta(enCurso))
  })

  it('suma los llamamientos anteriores y el que sigue en curso', () => {
    const employee = makeEmployee({
      isSeasonal: true,
      activityPeriods: [makePeriod('2026-01-05', '2026-02-28'), makePeriod('2026-06-01')],
    })
    const cerrado = 55
    const enCurso = 214 // 1 de junio al 31 de diciembre
    expect(alta(employee)).toBe(cerrado + enCurso)
  })

  it('no cuenta dos veces los periodos solapados', () => {
    const employee = makeEmployee({
      isSeasonal: true,
      activityPeriods: [
        makePeriod('2026-01-05', '2026-02-28'),
        makePeriod('2026-02-01', '2026-02-20'),
      ],
    })
    expect(alta(employee)).toBe(55)
  })

  it('recorta los periodos al año consultado', () => {
    const employee = makeEmployee({
      isSeasonal: true,
      activityPeriods: [makePeriod('2025-12-01', '2026-01-31')],
    })
    expect(alta(employee)).toBe(31)
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
    expect(effectiveAnnualDays(employee, 2026, testSettings, [])).toBeCloseTo((184 * 23) / 365, 2)
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

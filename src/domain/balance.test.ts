import { describe, expect, it } from 'vitest'
import {
  checkSelection,
  committedDays,
  computeBalance,
  groupByYear,
  terminationSettlement,
} from './balance'
import { makeEmployee, makeRequest, testSettings } from './fixtures'

const employee = makeEmployee()

describe('saldo de vacaciones', () => {
  it('descuenta tanto las aprobadas como las pendientes', () => {
    const requests = [
      makeRequest({ id: 'a', status: 'aprobada', days: ['2026-05-04', '2026-05-05'] }),
      makeRequest({ id: 'b', status: 'pendiente', days: ['2026-06-01'] }),
      makeRequest({ id: 'c', status: 'rechazada', days: ['2026-07-01', '2026-07-02'] }),
    ]
    const balance = computeBalance(employee, 2026, testSettings, [], requests)

    expect(balance.assigned).toBe(23)
    expect(balance.approved).toBe(2)
    expect(balance.pending).toBe(1)
    expect(balance.available).toBe(20)
  })

  it('marca cuándo el número de días viene de un ajuste manual', () => {
    const withOverride = computeBalance(
      employee,
      2026,
      testSettings,
      [{ employeeId: employee.id, year: 2026, days: 25 }],
      [],
    )
    expect(withOverride.isOverridden).toBe(true)
    expect(withOverride.estimated).toBe(23)
    expect(withOverride.assigned).toBe(25)

    expect(computeBalance(employee, 2026, testSettings, [], []).isOverridden).toBe(false)
  })

  it('las solicitudes rechazadas no bloquean sus días', () => {
    const requests = [makeRequest({ status: 'rechazada', days: ['2026-07-01'] })]
    expect(committedDays(requests, employee.id, 2026).has('2026-07-01')).toBe(false)
  })
})

describe('validación de una selección', () => {
  it('acepta una selección dentro del saldo', () => {
    const check = checkSelection(employee, ['2026-05-04'], 2026, testSettings, [], [])
    expect(check.ok).toBe(true)
  })

  it('bloquea cuando se supera el saldo, también al administrador', () => {
    const allowances = [{ employeeId: employee.id, year: 2026, days: 2 }]
    const check = checkSelection(
      employee,
      ['2026-05-04', '2026-05-05', '2026-05-06'],
      2026,
      testSettings,
      allowances,
      [],
    )
    expect(check.ok).toBe(false)
    expect(check.ok === false && check.reason).toContain('Saldo insuficiente')
  })

  it('bloquea los días ya solicitados', () => {
    const requests = [makeRequest({ status: 'pendiente', days: ['2026-05-04'] })]
    const check = checkSelection(employee, ['2026-05-04'], 2026, testSettings, [], requests)
    expect(check.ok).toBe(false)
    expect(check.ok === false && check.reason).toContain('ya está solicitado')
  })

  it('rechaza una selección vacía', () => {
    const check = checkSelection(employee, [], 2026, testSettings, [], [])
    expect(check.ok).toBe(false)
  })
})

describe('liquidación al dar de baja', () => {
  it('sin días disfrutados, se le deben los acumulados hasta la fecha de baja', () => {
    const settlement = terminationSettlement(
      employee,
      2026,
      testSettings,
      [],
      '2026-06-30',
      '2026-06-30',
    )
    expect(settlement.taken).toBe(0)
    expect(settlement.entitlement).toBeCloseTo(11.42, 1)
    expect(settlement.difference).toBeCloseTo(11.42, 1)
  })

  it('detecta cuando el empleado ha disfrutado más de lo que le correspondía', () => {
    const requests = [
      makeRequest({
        status: 'aprobada',
        days: [
          '2026-01-05',
          '2026-01-06',
          '2026-01-07',
          '2026-01-08',
          '2026-01-09',
          '2026-01-10',
          '2026-01-12',
          '2026-01-13',
          '2026-01-14',
          '2026-01-15',
          '2026-01-16',
          '2026-01-17',
          '2026-01-19',
          '2026-01-20',
          '2026-01-21',
        ],
      }),
    ]
    const settlement = terminationSettlement(
      employee,
      2026,
      testSettings,
      requests,
      '2026-06-30',
      '2026-06-30',
    )
    expect(settlement.taken).toBe(15)
    expect(settlement.difference).toBeLessThan(0)
  })

  it('no cuenta los días aprobados que todavía no han llegado', () => {
    const requests = [
      makeRequest({ id: 'req-pasado', status: 'aprobada', days: ['2026-01-05'] }),
      makeRequest({ id: 'req-futuro', status: 'aprobada', days: ['2026-12-20'] }),
    ]
    const settlement = terminationSettlement(
      employee,
      2026,
      testSettings,
      requests,
      '2026-06-30',
      '2026-06-15',
    )
    expect(settlement.taken).toBe(1)
  })

  it('ignora las solicitudes pendientes o rechazadas', () => {
    const requests = [
      makeRequest({ id: 'req-pendiente', status: 'pendiente', days: ['2026-01-05'] }),
      makeRequest({ id: 'req-rechazada', status: 'rechazada', days: ['2026-01-06'] }),
    ]
    const settlement = terminationSettlement(
      employee,
      2026,
      testSettings,
      requests,
      '2026-06-30',
      '2026-06-15',
    )
    expect(settlement.taken).toBe(0)
  })
})

describe('selección a caballo entre dos años', () => {
  it('separa los días por año natural', () => {
    const grouped = groupByYear(['2026-12-30', '2026-12-31', '2027-01-02'])
    expect([...grouped.keys()]).toEqual([2026, 2027])
    expect(grouped.get(2026)).toEqual(['2026-12-30', '2026-12-31'])
    expect(grouped.get(2027)).toEqual(['2027-01-02'])
  })
})

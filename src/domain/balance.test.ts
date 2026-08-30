import { describe, expect, it } from 'vitest'
import { checkSelection, committedDays, computeBalance, groupByYear } from './balance'
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

describe('selección a caballo entre dos años', () => {
  it('separa los días por año natural', () => {
    const grouped = groupByYear(['2026-12-30', '2026-12-31', '2027-01-02'])
    expect([...grouped.keys()]).toEqual([2026, 2027])
    expect(grouped.get(2026)).toEqual(['2026-12-30', '2026-12-31'])
    expect(grouped.get(2027)).toEqual(['2027-01-02'])
  })
})

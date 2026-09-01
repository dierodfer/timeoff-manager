import { describe, expect, it } from 'vitest'
import { makeEmployee, makeRequest, testSettings } from '../domain/fixtures'
import type { Database } from '../domain/types'
import { removeRequestDay, resolveAllPending, resolveRequestDay } from './actions'

const employee = makeEmployee()

function makeDatabase(overrides: Partial<Database> = {}): Database {
  return {
    settings: testSettings,
    employees: [employee],
    holidays: [],
    requests: [],
    allowances: [],
    ...overrides,
  }
}

describe('resolveRequestDay', () => {
  it('separa el día resuelto y deja el resto pendiente', () => {
    const request = makeRequest({
      status: 'pendiente',
      days: ['2026-05-04', '2026-05-05', '2026-05-06'],
    })
    const database = makeDatabase({ requests: [request] })

    const outcome = resolveRequestDay(database, request.id, '2026-05-05', 'aprobada', 'admin-1')
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    const [pending, resolved] = outcome.database.requests
    expect(pending.id).toBe(request.id)
    expect(pending.status).toBe('pendiente')
    expect(pending.days).toEqual(['2026-05-04', '2026-05-06'])

    expect(resolved.id).not.toBe(request.id)
    expect(resolved.status).toBe('aprobada')
    expect(resolved.days).toEqual(['2026-05-05'])
    expect(resolved.resolvedBy).toBe('admin-1')
  })

  it('resuelve en el sitio cuando es el último día de la solicitud', () => {
    const request = makeRequest({ status: 'pendiente', days: ['2026-05-04'] })
    const database = makeDatabase({ requests: [request] })

    const outcome = resolveRequestDay(database, request.id, '2026-05-04', 'rechazada', 'admin-1')
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    expect(outcome.database.requests).toHaveLength(1)
    expect(outcome.database.requests[0].id).toBe(request.id)
    expect(outcome.database.requests[0].status).toBe('rechazada')
  })

  it('rechaza un día que no pertenece a la solicitud', () => {
    const request = makeRequest({ status: 'pendiente', days: ['2026-05-04'] })
    const database = makeDatabase({ requests: [request] })

    const outcome = resolveRequestDay(database, request.id, '2026-06-01', 'aprobada', 'admin-1')
    expect(outcome.ok).toBe(false)
  })

  it('rechaza resolver una solicitud que ya no está pendiente', () => {
    const request = makeRequest({ status: 'aprobada', days: ['2026-05-04'] })
    const database = makeDatabase({ requests: [request] })

    const outcome = resolveRequestDay(database, request.id, '2026-05-04', 'rechazada', 'admin-1')
    expect(outcome.ok).toBe(false)
  })
})

describe('removeRequestDay', () => {
  it('quita solo el día indicado y deja el resto de la solicitud intacto', () => {
    const request = makeRequest({
      status: 'aprobada',
      days: ['2026-01-12', '2026-01-13', '2026-01-14'],
    })
    const database = makeDatabase({ requests: [request] })

    const outcome = removeRequestDay(database, request.id, '2026-01-13', {
      ...employee,
      role: 'admin',
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    expect(outcome.database.requests).toHaveLength(1)
    expect(outcome.database.requests[0].id).toBe(request.id)
    expect(outcome.database.requests[0].days).toEqual(['2026-01-12', '2026-01-14'])
  })

  it('elimina la solicitud entera cuando es su único día', () => {
    const request = makeRequest({ status: 'aprobada', days: ['2026-01-12'] })
    const database = makeDatabase({ requests: [request] })

    const outcome = removeRequestDay(database, request.id, '2026-01-12', {
      ...employee,
      role: 'admin',
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    expect(outcome.database.requests).toHaveLength(0)
  })

  it('rechaza un día que no pertenece a la solicitud', () => {
    const request = makeRequest({ status: 'aprobada', days: ['2026-01-12'] })
    const database = makeDatabase({ requests: [request] })

    const outcome = removeRequestDay(database, request.id, '2026-06-01', {
      ...employee,
      role: 'admin',
    })
    expect(outcome.ok).toBe(false)
  })

  it('un empleado no admin solo puede quitar días de sus solicitudes pendientes', () => {
    const request = makeRequest({ status: 'aprobada', days: ['2026-01-12', '2026-01-13'] })
    const database = makeDatabase({ requests: [request] })

    const outcome = removeRequestDay(database, request.id, '2026-01-12', employee)
    expect(outcome.ok).toBe(false)
  })
})

describe('resolveAllPending', () => {
  it('aprueba todas las solicitudes pendientes de un empleado en un año', () => {
    const requests = [
      makeRequest({ id: 'a', status: 'pendiente', days: ['2026-05-04'] }),
      makeRequest({ id: 'b', status: 'pendiente', days: ['2026-06-01', '2026-06-02'] }),
      makeRequest({ id: 'c', status: 'aprobada', days: ['2026-07-01'] }),
    ]
    const database = makeDatabase({ requests })

    const outcome = resolveAllPending(database, employee.id, 2026, 'aprobada', 'admin-1')
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    expect(outcome.database.requests.every((request) => request.status === 'aprobada')).toBe(true)
  })

  it('no toca las solicitudes de otro empleado ni de otro año', () => {
    const other = makeEmployee({ id: 'emp-2' })
    const requests = [
      makeRequest({ id: 'a', status: 'pendiente', days: ['2026-05-04'] }),
      makeRequest({ id: 'b', employeeId: other.id, status: 'pendiente', days: ['2026-05-05'] }),
      makeRequest({ id: 'c', year: 2027, status: 'pendiente', days: ['2027-05-04'] }),
    ]
    const database = makeDatabase({ employees: [employee, other], requests })

    const outcome = resolveAllPending(database, employee.id, 2026, 'aprobada', 'admin-1')
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    const byId = new Map(outcome.database.requests.map((request) => [request.id, request]))
    expect(byId.get('a')?.status).toBe('aprobada')
    expect(byId.get('b')?.status).toBe('pendiente')
    expect(byId.get('c')?.status).toBe('pendiente')
  })

  it('falla cuando no hay nada pendiente', () => {
    const database = makeDatabase({
      requests: [makeRequest({ status: 'aprobada', days: ['2026-05-04'] })],
    })

    const outcome = resolveAllPending(database, employee.id, 2026, 'aprobada', 'admin-1')
    expect(outcome.ok).toBe(false)
  })
})

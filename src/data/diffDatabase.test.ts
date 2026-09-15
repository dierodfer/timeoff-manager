import { describe, expect, it } from 'vitest'
import { makeEmployee, makePeriod, makeRequest, testSettings } from '../domain/fixtures'
import type { Database } from '../domain/types'
import { diffDatabase } from './diffDatabase'

function makeDatabase(overrides: Partial<Database> = {}): Database {
  return {
    settings: testSettings,
    employees: [makeEmployee()],
    holidays: [],
    requests: [],
    allowances: [],
    ...overrides,
  }
}

const EMPTY_DIFF = {
  settings: null,
  employees: { update: [], delete: [] },
  activityPeriods: { replaceFor: [] },
  holidays: { insert: [], update: [], delete: [] },
  allowances: { upsert: [], delete: [] },
  requests: { insert: [], update: [], delete: [] },
  requestDays: { replaceFor: [] },
  comments: { insert: [] },
}

describe('diffDatabase', () => {
  it('no ve ningún cambio entre dos capturas idénticas', () => {
    const database = makeDatabase()
    expect(diffDatabase(database, database)).toEqual(EMPTY_DIFF)
  })

  it('detecta un cambio de settings', () => {
    const previous = makeDatabase()
    const next = makeDatabase({ settings: { ...testSettings, defaultAnnualDays: 25 } })
    expect(diffDatabase(previous, next).settings).toEqual(next.settings)
  })

  it('detecta un cambio de columnas de un empleado', () => {
    const previous = makeDatabase()
    const changed = makeEmployee({ lastName: 'Otro apellido' })
    const next = makeDatabase({ employees: [changed] })
    const diff = diffDatabase(previous, next)
    expect(diff.employees.update).toEqual([changed])
    expect(diff.activityPeriods.replaceFor).toEqual([])
  })

  it('detecta un empleado eliminado', () => {
    const previous = makeDatabase()
    const next = makeDatabase({ employees: [] })
    expect(diffDatabase(previous, next).employees.delete).toEqual(['emp-1'])
  })

  it('no trata un empleado nuevo como update: las altas van por la Edge Function', () => {
    const previous = makeDatabase({ employees: [] })
    const employee = makeEmployee()
    const next = makeDatabase({ employees: [employee] })
    const diff = diffDatabase(previous, next)
    expect(diff.employees.update).toEqual([])
    expect(diff.employees.delete).toEqual([])
  })

  it('marca el empleado para sustituir sus periodos cuando cambian, sin tocar employees.update', () => {
    const previous = makeDatabase({
      employees: [makeEmployee({ activityPeriods: [makePeriod('2020-01-01')] })],
    })
    const next = makeDatabase({
      employees: [makeEmployee({ activityPeriods: [makePeriod('2020-01-01', '2026-06-15')] })],
    })
    const diff = diffDatabase(previous, next)
    expect(diff.activityPeriods.replaceFor).toEqual(['emp-1'])
    expect(diff.employees.update).toEqual([])
  })

  it('no ve cambio en los periodos si el conjunto es el mismo en otro orden', () => {
    const a = makePeriod('2020-01-01', '2020-06-01')
    const b = makePeriod('2021-01-01')
    const previous = makeDatabase({ employees: [makeEmployee({ activityPeriods: [a, b] })] })
    const next = makeDatabase({ employees: [makeEmployee({ activityPeriods: [b, a] })] })
    expect(diffDatabase(previous, next).activityPeriods.replaceFor).toEqual([])
  })

  it('festivos: inserta, actualiza y borra', () => {
    const stays = { id: 'hol-1', date: '2026-01-01', name: 'Año Nuevo', scope: 'nacional' as const }
    const renamed = { id: 'hol-2', date: '2026-01-06', name: 'Reyes', scope: 'nacional' as const }
    const removed = { id: 'hol-3', date: '2026-12-25', name: 'Navidad', scope: 'nacional' as const }
    const previous = makeDatabase({ holidays: [stays, renamed, removed] })

    const added = { id: 'hol-4', date: '2026-08-15', name: 'Asunción', scope: 'nacional' as const }
    const renamedNext = { ...renamed, name: 'Epifanía' }
    const next = makeDatabase({ holidays: [stays, renamedNext, added] })

    const diff = diffDatabase(previous, next)
    expect(diff.holidays.insert).toEqual([added])
    expect(diff.holidays.update).toEqual([renamedNext])
    expect(diff.holidays.delete).toEqual(['hol-3'])
  })

  it('allowances: upsert por clave compuesta y borrado', () => {
    const previous = makeDatabase({
      allowances: [
        { employeeId: 'emp-1', year: 2026, days: 20 },
        { employeeId: 'emp-1', year: 2027, days: 22 },
      ],
    })
    const next = makeDatabase({
      allowances: [
        { employeeId: 'emp-1', year: 2026, days: 20 }, // sin cambios
        { employeeId: 'emp-2', year: 2026, days: 18 }, // nuevo
      ],
    })
    const diff = diffDatabase(previous, next)
    expect(diff.allowances.upsert).toEqual([{ employeeId: 'emp-2', year: 2026, days: 18 }])
    expect(diff.allowances.delete).toEqual([{ employeeId: 'emp-1', year: 2027 }])
  })

  it('una solicitud nueva se inserta con sus días y comentarios', () => {
    const previous = makeDatabase()
    const comment = {
      id: 'cmt-1',
      authorId: 'emp-1',
      authorName: 'Ana García',
      text: 'Primer día',
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    const request = makeRequest({ days: ['2026-06-01', '2026-06-02'], comments: [comment] })
    const next = makeDatabase({ requests: [request] })

    const diff = diffDatabase(previous, next)
    expect(diff.requests.insert).toEqual([request])
    expect(diff.requests.update).toEqual([])
    expect(diff.requestDays.replaceFor).toEqual(['req-1'])
    expect(diff.comments.insert).toEqual([{ requestId: 'req-1', comment }])
  })

  it('un cambio de estado sin cambio de días no toca requestDays', () => {
    const request = makeRequest({ days: ['2026-06-01'], status: 'pendiente' })
    const previous = makeDatabase({ requests: [request] })
    const resolved = {
      ...request,
      status: 'aprobada' as const,
      resolvedBy: 'emp-1',
      resolvedAt: 'x',
    }
    const next = makeDatabase({ requests: [resolved] })

    const diff = diffDatabase(previous, next)
    expect(diff.requests.update).toEqual([resolved])
    expect(diff.requestDays.replaceFor).toEqual([])
  })

  it('un cambio de días sin cambio de columnas no toca requests.update', () => {
    const request = makeRequest({ days: ['2026-06-01', '2026-06-02'] })
    const previous = makeDatabase({ requests: [request] })
    const shrunk = { ...request, days: ['2026-06-02'] }
    const next = makeDatabase({ requests: [shrunk] })

    const diff = diffDatabase(previous, next)
    expect(diff.requests.update).toEqual([])
    expect(diff.requestDays.replaceFor).toEqual(['req-1'])
  })

  it('una solicitud eliminada no necesita nada más: la cascada se lleva días y comentarios', () => {
    const request = makeRequest()
    const previous = makeDatabase({ requests: [request] })
    const next = makeDatabase({ requests: [] })

    const diff = diffDatabase(previous, next)
    expect(diff.requests.delete).toEqual(['req-1'])
    expect(diff.requestDays.replaceFor).toEqual([])
    expect(diff.comments.insert).toEqual([])
  })

  it('separar un día copia el hilo con ids nuevos, y solo esos ids se insertan', () => {
    const original = {
      id: 'cmt-1',
      authorId: 'emp-1',
      authorName: 'Ana García',
      text: 'Comentario original',
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    const request = makeRequest({ days: ['2026-06-01', '2026-06-02'], comments: [original] })
    const previous = makeDatabase({ requests: [request] })

    // resolveRequestDay() separando 2026-06-01: req-1 se queda con el día que sobra (mismo id,
    // mismo comentario) y aparece req-2 con el día resuelto y el hilo copiado con id nuevo.
    const stillPending = { ...request, days: ['2026-06-02'] }
    const copiedComment = { ...original, id: 'cmt-2' }
    const resolved = makeRequest({
      id: 'req-2',
      days: ['2026-06-01'],
      status: 'aprobada',
      resolvedBy: 'emp-1',
      resolvedAt: '2026-06-01T00:00:00.000Z',
      comments: [copiedComment],
    })
    const next = makeDatabase({ requests: [stillPending, resolved] })

    const diff = diffDatabase(previous, next)
    expect(diff.requests.insert).toEqual([resolved])
    expect(diff.requests.update).toEqual([])
    expect(diff.requestDays.replaceFor.sort()).toEqual(['req-1', 'req-2'])
    expect(diff.comments.insert).toEqual([{ requestId: 'req-2', comment: copiedComment }])
  })
})

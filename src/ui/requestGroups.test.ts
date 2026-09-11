import { describe, expect, it } from 'vitest'
import { makeEmployee, makeRequest } from '../domain/fixtures'
import {
  countDaysByStatus,
  groupRequestsByEmployee,
  pendingKeysOf,
  rowKey,
  selectionOf,
  toggleInSet,
} from './requestGroups'

const ana = makeEmployee({ id: 'emp-ana', firstName: 'Ana', lastName: 'García' })
const bruno = makeEmployee({ id: 'emp-bruno', firstName: 'Bruno', lastName: 'Alonso' })
const empleados = [bruno, ana] // a propósito sin ordenar

describe('countDaysByStatus', () => {
  it('cuenta días, no solicitudes, y separa por estado', () => {
    const counts = countDaysByStatus(
      [
        makeRequest({ id: 'a', status: 'pendiente', days: ['2026-05-04', '2026-05-05'] }),
        makeRequest({ id: 'b', status: 'aprobada', days: ['2026-06-01'] }),
        makeRequest({ id: 'c', status: 'rechazada', days: ['2026-07-01', '2026-07-02'] }),
      ],
      2026,
    )
    expect(counts).toEqual({ pendiente: 2, aprobada: 1, rechazada: 2 })
  })

  it('ignora otros años', () => {
    const counts = countDaysByStatus(
      [
        makeRequest({ id: 'a', year: 2026, days: ['2026-05-04'] }),
        makeRequest({ id: 'b', year: 2027, days: ['2027-05-04', '2027-05-05'] }),
      ],
      2026,
    )
    expect(counts.pendiente).toBe(1)
  })

  it('sin solicitudes devuelve todo a cero', () => {
    expect(countDaysByStatus([], 2026)).toEqual({ pendiente: 0, aprobada: 0, rechazada: 0 })
  })
})

describe('groupRequestsByEmployee', () => {
  const requests = [
    makeRequest({
      id: 'r1',
      employeeId: ana.id,
      status: 'pendiente',
      days: ['2026-05-05', '2026-05-04'],
    }),
    makeRequest({ id: 'r2', employeeId: ana.id, status: 'aprobada', days: ['2026-03-02'] }),
    makeRequest({ id: 'r3', employeeId: bruno.id, status: 'pendiente', days: ['2026-08-10'] }),
  ]

  it('agrupa por empleado y ordena los grupos por nombre', () => {
    const groups = groupRequestsByEmployee(requests, empleados, 2026, 'todas')
    expect(groups.map((g) => g.employee.id)).toEqual([ana.id, bruno.id])
  })

  it('ordena los días cronológicamente dentro del grupo', () => {
    const [grupoAna] = groupRequestsByEmployee(requests, empleados, 2026, 'todas')
    expect(grupoAna.rows.map((row) => row.day)).toEqual(['2026-03-02', '2026-05-04', '2026-05-05'])
  })

  it('deja fuera a quien no tiene ninguna fila con ese filtro', () => {
    const groups = groupRequestsByEmployee(requests, empleados, 2026, 'aprobada')
    expect(groups.map((g) => g.employee.id)).toEqual([ana.id])
  })

  it('los totales de la cabecera cuentan todo el año, aunque el filtro recorte la tabla', () => {
    const [grupoAna] = groupRequestsByEmployee(requests, empleados, 2026, 'aprobada')
    // La tabla solo enseña el día aprobado...
    expect(grupoAna.rows).toHaveLength(1)
    // ...pero la cabecera sigue diciendo que Ana tiene 2 solicitudes y 3 días en el año.
    expect(grupoAna.requestCount).toBe(2)
    expect(grupoAna.totalDays).toBe(3)
  })

  it('pendingCount cuenta solo lo pendiente de las filas visibles', () => {
    const [grupoAna] = groupRequestsByEmployee(requests, empleados, 2026, 'todas')
    expect(grupoAna.pendingCount).toBe(2)

    const [soloAprobadas] = groupRequestsByEmployee(requests, empleados, 2026, 'aprobada')
    expect(soloAprobadas.pendingCount).toBe(0)
  })

  it('ignora las solicitudes de otros años', () => {
    const otroAño = makeRequest({
      id: 'r9',
      employeeId: ana.id,
      year: 2027,
      days: ['2027-01-02'],
    })
    const groups = groupRequestsByEmployee([...requests, otroAño], empleados, 2026, 'todas')
    expect(groups.find((g) => g.employee.id === ana.id)?.rows).toHaveLength(3)
  })

  it('sin solicitudes no devuelve grupos', () => {
    expect(groupRequestsByEmployee([], empleados, 2026, 'todas')).toEqual([])
  })

  it('cada fila conserva de qué solicitud viene, que es lo que permite resolver día a día', () => {
    const [grupoAna] = groupRequestsByEmployee(requests, empleados, 2026, 'pendiente')
    expect(grupoAna.rows.every((row) => row.requestId === 'r1')).toBe(true)
  })
})

describe('selección de días', () => {
  const requests = [
    makeRequest({
      id: 'r1',
      employeeId: ana.id,
      status: 'pendiente',
      days: ['2026-05-04', '2026-05-05'],
    }),
    makeRequest({ id: 'r2', employeeId: ana.id, status: 'aprobada', days: ['2026-03-02'] }),
  ]
  const [grupo] = groupRequestsByEmployee(requests, empleados, 2026, 'todas')

  it('solo son seleccionables los días pendientes', () => {
    expect(pendingKeysOf(grupo)).toEqual([rowKey('r1', '2026-05-04'), rowKey('r1', '2026-05-05')])
  })

  it('selectionOf devuelve lo marcado en el formato que espera actions.ts', () => {
    const selected = new Set([rowKey('r1', '2026-05-05')])
    expect(selectionOf(grupo, selected)).toEqual([{ requestId: 'r1', day: '2026-05-05' }])
  })

  it('un día aprobado marcado por error no se cuela en la selección', () => {
    const selected = new Set([rowKey('r2', '2026-03-02')])
    expect(selectionOf(grupo, selected)).toEqual([])
  })

  it('toggleInSet añade, quita y no toca el conjunto original', () => {
    const original = new Set(['a'])
    const conB = toggleInSet(original, 'b')
    expect([...conB].sort()).toEqual(['a', 'b'])
    expect([...toggleInSet(conB, 'a')]).toEqual(['b'])
    expect([...original]).toEqual(['a'])
  })
})

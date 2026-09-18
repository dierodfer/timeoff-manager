import { describe, expect, it } from 'vitest'
import { makeEmployee, makePeriod } from '../domain/fixtures'
import {
  filterEmployees,
  formatEmployeeName,
  sortEmployeesByName,
  type EmployeeFilters,
} from './employeeFilters'

const HOY = '2026-09-11'

const ana = makeEmployee({
  id: 'ana',
  firstName: 'Ana',
  lastName: 'García',
  activityPeriods: [makePeriod('2020-01-01')],
})
const bruno = makeEmployee({
  id: 'bruno',
  firstName: 'Bruno',
  lastName: 'Alonso',
  isSeasonal: true,
  activityPeriods: [makePeriod('2024-03-01')],
})
// De baja: su último periodo ya está cerrado.
const carla = makeEmployee({
  id: 'carla',
  firstName: 'Carla',
  lastName: 'Ortiz',
  activityPeriods: [makePeriod('2019-01-01', '2025-06-30')],
})

const todos = [ana, bruno, carla]
const base: EmployeeFilters = { search: '', status: 'todos', contract: 'todos' }
const filtrar = (cambios: Partial<EmployeeFilters>) =>
  filterEmployees(todos, { ...base, ...cambios }, HOY).map((e) => e.id)

describe('filtro de búsqueda', () => {
  it('busca por nombre sin distinguir mayúsculas', () => {
    expect(filtrar({ search: 'ana' })).toEqual(['ana'])
    expect(filtrar({ search: 'ANA' })).toEqual(['ana'])
  })

  it('busca también por apellido', () => {
    expect(filtrar({ search: 'ortiz' })).toEqual(['carla'])
  })

  it('ignora los espacios de alrededor', () => {
    expect(filtrar({ search: '  bruno  ' })).toEqual(['bruno'])
  })

  it('sin coincidencias devuelve la lista vacía', () => {
    expect(filtrar({ search: 'zzz' })).toEqual([])
  })
})

describe('filtro de estado', () => {
  it('«activos» deja fuera a quien tiene el último periodo cerrado', () => {
    expect(filtrar({ status: 'activos' })).toEqual(['ana', 'bruno'])
  })

  it('«bajas» deja solo a esa', () => {
    expect(filtrar({ status: 'bajas' })).toEqual(['carla'])
  })

  it('«todos» no descarta a nadie', () => {
    expect(filtrar({ status: 'todos' })).toHaveLength(3)
  })
})

describe('filtro de tipo de contrato', () => {
  it('separa fijos de fijos discontinuos', () => {
    expect(filtrar({ contract: 'discontinuo' })).toEqual(['bruno'])
    expect(filtrar({ contract: 'fijo' })).toEqual(['ana', 'carla'])
  })
})

describe('los filtros se combinan', () => {
  it('activos + fijos', () => {
    expect(filtrar({ status: 'activos', contract: 'fijo' })).toEqual(['ana'])
  })

  it('búsqueda + estado que no casan devuelve vacío', () => {
    expect(filtrar({ search: 'carla', status: 'activos' })).toEqual([])
  })
})

describe('formatEmployeeName', () => {
  it('apellidos-nombre: con coma', () => {
    expect(formatEmployeeName(ana, 'apellidos-nombre')).toBe('García, Ana')
  })

  it('nombre-apellidos: sin coma', () => {
    expect(formatEmployeeName(ana, 'nombre-apellidos')).toBe('Ana García')
  })

  it('sin apellidos, no deja una coma suelta', () => {
    const sinApellidos = makeEmployee({ firstName: 'Ana', lastName: '' })
    expect(formatEmployeeName(sinApellidos, 'apellidos-nombre')).toBe('Ana')
  })
})

describe('sortEmployeesByName', () => {
  it('alfabético por apellido cuando se muestra «Apellidos, Nombre»', () => {
    const result = sortEmployeesByName(todos, 'apellidos-nombre')
    expect(result.map((e) => e.id)).toEqual(['bruno', 'ana', 'carla']) // Alonso, García, Ortiz
  })

  it('alfabético por nombre cuando se muestra «Nombre Apellidos»', () => {
    const result = sortEmployeesByName(todos, 'nombre-apellidos')
    expect(result.map((e) => e.id)).toEqual(['ana', 'bruno', 'carla']) // Ana, Bruno, Carla
  })

  it('no altera el array que recibe', () => {
    const original = [...todos]
    sortEmployeesByName(todos, 'apellidos-nombre')
    expect(todos).toEqual(original)
  })
})

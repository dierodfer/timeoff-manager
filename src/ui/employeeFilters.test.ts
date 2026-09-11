import { describe, expect, it } from 'vitest'
import { makeEmployee, makePeriod } from '../domain/fixtures'
import { filterAndSortEmployees, type EmployeeFilters } from './employeeFilters'

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
const base: EmployeeFilters = { search: '', status: 'todos', contract: 'todos', order: 'nombre' }
const filtrar = (cambios: Partial<EmployeeFilters>) =>
  filterAndSortEmployees(todos, { ...base, ...cambios }, HOY).map((e) => e.id)

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

describe('orden', () => {
  it('por nombre, ascendente y descendente', () => {
    expect(filtrar({ order: 'nombre' })).toEqual(['ana', 'bruno', 'carla'])
    expect(filtrar({ order: 'nombre-desc' })).toEqual(['carla', 'bruno', 'ana'])
  })

  it('por fecha de alta, del más reciente al más antiguo', () => {
    expect(filtrar({ order: 'alta' })).toEqual(['bruno', 'ana', 'carla'])
  })

  it('no altera el array que recibe', () => {
    const original = [...todos]
    filterAndSortEmployees(todos, { ...base, order: 'nombre-desc' }, HOY)
    expect(todos).toEqual(original)
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

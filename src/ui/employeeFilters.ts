import { isActive, sortedPeriods } from '../domain/accrual'
import { compareIso } from '../domain/dates'
import type { Employee, IsoDate } from '../domain/types'
import { displayName, sortByName } from '../state/actions'

export type StatusFilter = 'todos' | 'activos' | 'bajas'
export type ContractFilter = 'todos' | 'fijo' | 'discontinuo'
export type SortOrder = 'nombre' | 'nombre-desc' | 'alta'

export interface EmployeeFilters {
  search: string
  status: StatusFilter
  contract: ContractFilter
  order: SortOrder
}

/**
 * Filtra y ordena la lista de Empleados. Un fijo discontinuo entre llamamientos cuenta
 * como de baja, que es justo desde donde se le vuelve a dar de alta.
 */
export function filterAndSortEmployees(
  employees: Employee[],
  filters: EmployeeFilters,
  today: IsoDate,
): Employee[] {
  const term = filters.search.trim().toLowerCase()
  const matching = employees.filter((employee) => {
    if (term && !displayName(employee).toLowerCase().includes(term)) return false
    if (filters.status === 'activos' && !isActive(employee, today)) return false
    if (filters.status === 'bajas' && isActive(employee, today)) return false
    if (filters.contract === 'fijo' && employee.isSeasonal) return false
    if (filters.contract === 'discontinuo' && !employee.isSeasonal) return false
    return true
  })

  if (filters.order === 'alta') {
    return [...matching].sort((a, b) =>
      compareIso(sortedPeriods(b).at(-1)?.start ?? '', sortedPeriods(a).at(-1)?.start ?? ''),
    )
  }
  const byName = sortByName(matching)
  return filters.order === 'nombre-desc' ? byName.reverse() : byName
}

import { isActive } from '../domain/accrual'
import type { Employee, IsoDate } from '../domain/types'
import { displayName } from '../state/actions'

export type StatusFilter = 'activos' | 'bajas'
export type ContractFilter = 'fijo' | 'discontinuo'
/** Cómo se pinta el nombre en la lista: «Apellidos, Nombre» (con coma) o «Nombre Apellidos». */
export type NameOrder = 'apellidos-nombre' | 'nombre-apellidos'

export interface EmployeeFilters {
  search: string
  /** Tags multi-selección: ambos valores marcados por defecto equivale a no filtrar. */
  status: ReadonlySet<StatusFilter>
  contract: ReadonlySet<ContractFilter>
}

/**
 * Filtra la lista de Empleados. No ordena: eso lo hace sortEmployeesByName(), aparte, porque el
 * orden depende de NameOrder y los filtros no. Un fijo discontinuo entre llamamientos cuenta
 * como de baja, que es justo desde donde se le vuelve a dar de alta.
 */
export function filterEmployees(
  employees: Employee[],
  filters: EmployeeFilters,
  today: IsoDate,
): Employee[] {
  const term = filters.search.trim().toLowerCase()
  return employees.filter((employee) => {
    if (term && !displayName(employee).toLowerCase().includes(term)) return false
    const status: StatusFilter = isActive(employee, today) ? 'activos' : 'bajas'
    if (!filters.status.has(status)) return false
    const contract: ContractFilter = employee.isSeasonal ? 'discontinuo' : 'fijo'
    if (!filters.contract.has(contract)) return false
    return true
  })
}

/** «Apellidos, Nombre» con coma; sin apellidos, se queda solo en el nombre, sin coma suelta. */
export function formatEmployeeName(employee: Employee, order: NameOrder): string {
  if (order === 'nombre-apellidos') return displayName(employee)
  const lastName = employee.lastName.trim()
  return lastName ? `${lastName}, ${employee.firstName.trim()}` : employee.firstName.trim()
}

/** Siempre alfabético A-Z, por el nombre tal y como se está mostrando (NameOrder). */
export function sortEmployeesByName(employees: Employee[], order: NameOrder): Employee[] {
  return [...employees].sort((a, b) =>
    formatEmployeeName(a, order).localeCompare(formatEmployeeName(b, order), 'es'),
  )
}

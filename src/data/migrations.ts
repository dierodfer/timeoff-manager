import { todayIso } from '../domain/dates'
import type { ActivityPeriod, Database, Employee, IsoDate } from '../domain/types'
import { newId } from './ids'
import type { StoredDatabase } from './repository'

interface EmployeeV1 extends Omit<Employee, 'activityPeriods'> {
  hireDate: IsoDate
  terminationDate: IsoDate | null
  activityPeriods: { id: string; start: IsoDate; end: IsoDate }[]
}

interface DatabaseV1 extends Omit<Database, 'employees'> {
  employees: EmployeeV1[]
}

export interface StoredDatabaseV1 extends Omit<StoredDatabase, 'data'> {
  data: DatabaseV1
}

function employeeToV2(employee: EmployeeV1, today: IsoDate): Employee {
  const { hireDate, terminationDate, activityPeriods, ...rest } = employee
  const start = hireDate ?? rest.createdAt.slice(0, 10)
  const end = terminationDate ?? null

  if (!employee.isSeasonal || activityPeriods.length === 0) {
    return { ...rest, activityPeriods: [{ id: newId('per'), start, end }] }
  }

  const periods = activityPeriods
    .map((period) => ({
      id: period.id,
      start: period.start > start ? period.start : start,
      end: end !== null && period.end > end ? end : period.end,
    }))
    .filter((period) => period.start <= period.end)
    .map<ActivityPeriod>((period) =>
      end === null && period.start <= today && today <= period.end
        ? { ...period, end: null }
        : period,
    )

  return { ...rest, activityPeriods: periods }
}

export function migrateStored(
  stored: StoredDatabase | StoredDatabaseV1,
  today: IsoDate = todayIso(),
): Database {
  if (stored.version >= 2) return stored.data

  const data = stored.data as DatabaseV1
  return { ...data, employees: data.employees.map((employee) => employeeToV2(employee, today)) }
}

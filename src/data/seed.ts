import { preloadedHolidays } from '../domain/holidays.es'
import type { Database, Employee, Holiday } from '../domain/types'
import { newId } from './ids'
import { hashPin, randomSalt } from './pin'

export const DEFAULT_ANNUAL_DAYS = 23
export const DEFAULT_WORKWEEK = [1, 2, 3, 4, 5, 6] // lunes a sábado

export interface FirstRunInput {
  organizationName: string
  firstName: string
  lastName: string
  pin: string
  year: number
}

export function seedHolidays(year: number): Holiday[] {
  return [...preloadedHolidays(year), ...preloadedHolidays(year + 1)]
}

export async function createEmployee(
  input: Omit<Employee, 'id' | 'pinHash' | 'pinSalt' | 'createdAt'> & { pin: string },
): Promise<Employee> {
  const { pin, ...rest } = input
  const pinSalt = randomSalt()
  return {
    ...rest,
    id: newId('emp'),
    pinSalt,
    pinHash: await hashPin(pin, pinSalt),
    createdAt: new Date().toISOString(),
  }
}

export async function createInitialDatabase(input: FirstRunInput): Promise<Database> {
  const admin = await createEmployee({
    firstName: input.firstName,
    lastName: input.lastName,
    role: 'admin',
    hireDate: `${input.year}-01-01`,
    terminationDate: null,
    isSeasonal: false,
    activityPeriods: [],
    pin: input.pin,
  })

  return {
    settings: {
      organizationName: input.organizationName,
      defaultAnnualDays: DEFAULT_ANNUAL_DAYS,
      workweek: DEFAULT_WORKWEEK,
    },
    employees: [admin],
    holidays: seedHolidays(input.year),
    requests: [],
    allowances: [],
  }
}

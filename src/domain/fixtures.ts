import type { ActivityPeriod, Employee, IsoDate, Settings, VacationRequest } from './types'

export const testSettings: Settings = {
  organizationName: 'Empresa',
  defaultAnnualDays: 23,
  workweek: [1, 2, 3, 4, 5, 6],
}

export function makePeriod(start: IsoDate, end: IsoDate | null = null): ActivityPeriod {
  return { id: `per-${start}`, start, end }
}

export function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 'emp-1',
    firstName: 'Ana',
    lastName: 'García',
    role: 'employee',
    isSeasonal: false,
    activityPeriods: [makePeriod('2020-01-01')],
    pinHash: '',
    pinSalt: '',
    createdAt: '2020-01-01T00:00:00.000Z',
    ...overrides,
  }
}

export function makeRequest(overrides: Partial<VacationRequest> = {}): VacationRequest {
  return {
    id: 'req-1',
    employeeId: 'emp-1',
    year: 2026,
    days: [],
    status: 'pendiente',
    createdBy: 'emp-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    resolvedBy: null,
    resolvedAt: null,
    comments: [],
    batchId: null,
    ...overrides,
  }
}

import type { Employee, Settings, VacationRequest } from './types'

/** Constructores mínimos para los tests del dominio. */

export const testSettings: Settings = {
  organizationName: 'Empresa',
  defaultAnnualDays: 23,
  workweek: [1, 2, 3, 4, 5, 6],
}

export function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 'emp-1',
    firstName: 'Ana',
    lastName: 'García',
    role: 'employee',
    hireDate: '2020-01-01',
    terminationDate: null,
    isSeasonal: false,
    activityPeriods: [],
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

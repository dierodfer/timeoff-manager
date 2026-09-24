import { describe, expect, it } from 'vitest'
import {
  activityPeriodToRow,
  allowanceToRow,
  commentToRow,
  databaseFromRows,
  employeeToRow,
  holidayToRow,
  requestToRow,
  settingsToRow,
  type LoadedRows,
} from './supabaseMappers'

describe('databaseFromRows', () => {
  it('ensambla el Database completo a partir de las ocho tablas', () => {
    const rows: LoadedRows = {
      organization: {
        id: 'org-1',
        name: 'Agrorifer',
        default_annual_days: 23,
        workweek: [1, 2, 3, 4, 5, 6],
        version: 1,
      },
      employees: [
        {
          id: 'emp-1',
          email: 'a@x.local',
          first_name: 'Ana',
          last_name: 'García',
          role: 'admin',
          is_seasonal: false,
        },
        {
          id: 'emp-2',
          email: 'b@x.local',
          first_name: 'Bea',
          last_name: 'López',
          role: 'employee',
          is_seasonal: true,
        },
      ],
      activityPeriods: [
        { id: 'per-1', employee_id: 'emp-1', start_date: '2020-01-01', end_date: null },
        { id: 'per-2', employee_id: 'emp-2', start_date: '2021-06-01', end_date: '2021-09-01' },
      ],
      holidays: [{ id: 'hol-1', day: '2026-01-01', name: 'Año Nuevo', scope: 'nacional' }],
      allowances: [{ employee_id: 'emp-2', year: 2026, days: 18 }],
      requests: [
        {
          id: 'req-1',
          employee_id: 'emp-2',
          year: 2026,
          status: 'pendiente',
          created_by: 'emp-2',
          created_at: '2026-01-01T00:00:00.000Z',
          resolved_by: null,
          resolved_at: null,
          batch_id: null,
        },
      ],
      requestDays: [
        { request_id: 'req-1', day: '2026-06-01' },
        { request_id: 'req-1', day: '2026-06-02' },
      ],
      comments: [
        {
          id: 'cmt-1',
          request_id: 'req-1',
          author_id: 'emp-1',
          author_name: 'Ana García',
          body: 'Vale',
          created_at: '2026-01-02T00:00:00.000Z',
        },
      ],
    }

    const database = databaseFromRows(rows)

    expect(database.settings).toEqual({
      organizationName: 'Agrorifer',
      defaultAnnualDays: 23,
      workweek: [1, 2, 3, 4, 5, 6],
    })
    expect(database.employees).toHaveLength(2)
    expect(database.employees[0]).toMatchObject({
      id: 'emp-1',
      firstName: 'Ana',
      role: 'admin',
      activityPeriods: [{ id: 'per-1', start: '2020-01-01', end: null }],
    })
    expect(database.holidays).toEqual([
      { id: 'hol-1', date: '2026-01-01', name: 'Año Nuevo', scope: 'nacional' },
    ])
    expect(database.allowances).toEqual([{ employeeId: 'emp-2', year: 2026, days: 18 }])
    expect(database.requests).toHaveLength(1)
    expect(database.requests[0]).toMatchObject({
      id: 'req-1',
      days: ['2026-06-01', '2026-06-02'],
      comments: [{ id: 'cmt-1', authorId: 'emp-1', authorName: 'Ana García', text: 'Vale' }],
    })
  })

  it('un empleado sin periodos, festivos o solicitudes no revienta', () => {
    const rows: LoadedRows = {
      organization: {
        id: 'org-1',
        name: 'Vacía',
        default_annual_days: 23,
        workweek: [1, 2, 3, 4, 5],
        version: 1,
      },
      employees: [
        {
          id: 'emp-1',
          email: null,
          first_name: 'Ana',
          last_name: '',
          role: 'admin',
          is_seasonal: false,
        },
      ],
      activityPeriods: [],
      holidays: [],
      allowances: [],
      requests: [],
      requestDays: [],
      comments: [],
    }
    const database = databaseFromRows(rows)
    expect(database.employees[0]?.activityPeriods).toEqual([])
    expect(database.requests).toEqual([])
  })
})

describe('mapeos individuales, ida y vuelta', () => {
  it('settings', () => {
    const settings = { organizationName: 'X', defaultAnnualDays: 22, workweek: [1, 2, 3, 4, 5] }
    expect(settingsToRow(settings)).toEqual({
      name: 'X',
      default_annual_days: 22,
      workweek: [1, 2, 3, 4, 5],
    })
  })

  it('employee: no incluye periodos ni pin', () => {
    const row = employeeToRow({
      id: 'emp-1',
      firstName: 'Ana',
      lastName: 'García',
      role: 'admin',
      isSeasonal: false,
      activityPeriods: [],
      pinHash: 'x',
      pinSalt: 'y',
      createdAt: 'z',
    })
    expect(row).toEqual({
      first_name: 'Ana',
      last_name: 'García',
      role: 'admin',
      is_seasonal: false,
    })
  })

  it('activity period', () => {
    expect(activityPeriodToRow('emp-1', { id: 'per-1', start: '2020-01-01', end: null })).toEqual({
      id: 'per-1',
      employee_id: 'emp-1',
      start_date: '2020-01-01',
      end_date: null,
    })
  })

  it('holiday: date -> day', () => {
    expect(
      holidayToRow('org-1', {
        id: 'hol-1',
        date: '2026-01-01',
        name: 'Año Nuevo',
        scope: 'nacional',
      }),
    ).toEqual({
      id: 'hol-1',
      org_id: 'org-1',
      day: '2026-01-01',
      name: 'Año Nuevo',
      scope: 'nacional',
    })
  })

  it('allowance', () => {
    expect(allowanceToRow({ employeeId: 'emp-1', year: 2026, days: 20 })).toEqual({
      employee_id: 'emp-1',
      year: 2026,
      days: 20,
    })
  })

  it('request: createdBy vacío se manda como null', () => {
    const row = requestToRow({
      id: 'req-1',
      employeeId: 'emp-1',
      year: 2026,
      days: ['2026-01-01'],
      status: 'pendiente',
      createdBy: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      resolvedBy: null,
      resolvedAt: null,
      comments: [],
      batchId: null,
    })
    expect(row.created_by).toBeNull()
  })

  it('comment: text -> body', () => {
    const row = commentToRow('req-1', {
      id: 'cmt-1',
      authorId: 'emp-1',
      authorName: 'Ana',
      text: 'Hola',
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    expect(row).toEqual({
      id: 'cmt-1',
      request_id: 'req-1',
      author_id: 'emp-1',
      author_name: 'Ana',
      body: 'Hola',
      created_at: '2026-01-01T00:00:00.000Z',
    })
  })
})

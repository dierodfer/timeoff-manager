import { describe, expect, it } from 'vitest'
import { testSettings } from '../domain/fixtures'
import type { Database } from '../domain/types'
import { parseBackup } from './backup'
import { migrateStored, type StoredDatabaseV1 } from './migrations'

const TODAY = '2026-06-15'

function storedV1(employee: Record<string, unknown>): StoredDatabaseV1 {
  return {
    version: 1,
    savedAt: '2026-01-01T00:00:00.000Z',
    data: {
      settings: testSettings,
      holidays: [],
      requests: [],
      allowances: [],
      employees: [
        {
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
          ...employee,
        },
      ],
    },
  }
}

const firstEmployee = (database: Database) => database.employees[0]

describe('migración v1 → v2', () => {
  it('convierte a un empleado de alta en un único periodo en curso', () => {
    const migrated = migrateStored(storedV1({}), TODAY)
    expect(firstEmployee(migrated).activityPeriods).toMatchObject([
      { start: '2020-01-01', end: null },
    ])
  })

  it('convierte una baja registrada en un periodo cerrado', () => {
    const migrated = migrateStored(storedV1({ terminationDate: '2026-03-31' }), TODAY)
    expect(firstEmployee(migrated).activityPeriods).toMatchObject([
      { start: '2020-01-01', end: '2026-03-31' },
    ])
  })

  it('deja de guardar hireDate y terminationDate', () => {
    const migrated = firstEmployee(migrateStored(storedV1({}), TODAY))
    expect('hireDate' in migrated).toBe(false)
    expect('terminationDate' in migrated).toBe(false)
  })

  it('pasa los llamamientos del fijo discontinuo a periodos de actividad', () => {
    const migrated = migrateStored(
      storedV1({
        isSeasonal: true,
        activityPeriods: [
          { id: 'p1', start: '2026-01-05', end: '2026-02-28' },
          { id: 'p2', start: '2026-09-01', end: '2026-10-31' },
        ],
      }),
      TODAY,
    )
    expect(firstEmployee(migrated).activityPeriods).toEqual([
      { id: 'p1', start: '2026-01-05', end: '2026-02-28' },
      { id: 'p2', start: '2026-09-01', end: '2026-10-31' },
    ])
  })

  it('deja abierto el llamamiento que contiene hoy: es la proyección de la v1', () => {
    const migrated = migrateStored(
      storedV1({
        isSeasonal: true,
        activityPeriods: [{ id: 'p1', start: '2026-03-01', end: '2026-09-30' }],
      }),
      TODAY,
    )
    expect(firstEmployee(migrated).activityPeriods).toEqual([
      { id: 'p1', start: '2026-03-01', end: null },
    ])
  })

  it('recorta los llamamientos al tramo de relación laboral', () => {
    const migrated = migrateStored(
      storedV1({
        isSeasonal: true,
        hireDate: '2026-02-01',
        terminationDate: '2026-05-31',
        activityPeriods: [
          { id: 'p1', start: '2026-01-05', end: '2026-06-30' },
          { id: 'p2', start: '2026-09-01', end: '2026-10-31' },
        ],
      }),
      TODAY,
    )
    expect(firstEmployee(migrated).activityPeriods).toEqual([
      { id: 'p1', start: '2026-02-01', end: '2026-05-31' },
    ])
  })

  it('no toca una copia que ya está en v2', () => {
    const v2 = { version: 2, savedAt: '', data: { employees: [] } } as unknown as Parameters<
      typeof migrateStored
    >[0]
    expect(migrateStored(v2, TODAY)).toBe(v2.data)
  })
})

describe('parseBackup', () => {
  it('migra una copia de seguridad antigua al importarla', () => {
    const imported = parseBackup(JSON.stringify(storedV1({ terminationDate: '2026-03-31' })))
    expect(firstEmployee(imported).activityPeriods).toMatchObject([
      { start: '2020-01-01', end: '2026-03-31' },
    ])
  })
})

import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../domain/types'
import { ConcurrencyError } from './repository'
import { createSupabaseRepository } from './supabaseRepository'

type Row = Record<string, unknown>
type Tables = Record<string, Row[]>

// Cliente Supabase mínimo, en memoria: cubre la API fluida que usa supabaseRepository.ts, para
// probar el reparto de escrituras sin un proyecto real.
function makeFakeSupabase(seed: Tables) {
  const tables: Tables = structuredClone(seed)

  function writeBuilder(
    table: string,
    apply: (rows: Row[], predicate: (row: Row) => boolean) => Row[],
  ) {
    const conditions: [string, unknown][] = []
    const builder = {
      eq(column: string, value: unknown) {
        conditions.push([column, value])
        return builder
      },
      in(column: string, values: unknown[]) {
        const set = new Set(values)
        conditions.push([column, { has: (value: unknown) => set.has(value) }])
        return builder
      },
      then(resolve: (result: { data: null; error: null }) => void) {
        const predicate = (row: Row) =>
          conditions.every(([column, value]) =>
            value && typeof value === 'object' && 'has' in value
              ? (value as { has: (v: unknown) => boolean }).has(row[column])
              : row[column] === value,
          )
        tables[table] = apply(tables[table], predicate)
        resolve({ data: null, error: null })
      },
    }
    return builder
  }

  function from(table: string) {
    return {
      select() {
        // .range() trocea de verdad, como PostgREST: hace falta para poder probar que
        // fetchAll() (supabaseRepository.ts) pagina en vez de quedarse con la primera página.
        let bounds: [number, number] | null = null
        const builder = {
          returns() {
            const rows = structuredClone(tables[table])
            const sliced = bounds ? rows.slice(bounds[0], bounds[1] + 1) : rows
            return Promise.resolve({ data: sliced, error: null })
          },
          range(from: number, to: number) {
            bounds = [from, to]
            return builder
          },
        }
        return builder
      },
      insert(payload: Row | Row[]) {
        const items = structuredClone(Array.isArray(payload) ? payload : [payload])
        tables[table] = [...(tables[table] ?? []), ...items]
        return Promise.resolve({ data: null, error: null })
      },
      update(patch: Row) {
        return writeBuilder(table, (rows, predicate) =>
          rows.map((row) => (predicate(row) ? { ...row, ...patch } : row)),
        )
      },
      upsert(payload: Row[], options: { onConflict: string }) {
        const keys = options.onConflict.split(',')
        for (const item of payload) {
          const index = tables[table].findIndex((row) =>
            keys.every((key) => row[key] === item[key]),
          )
          if (index >= 0) tables[table][index] = { ...tables[table][index], ...item }
          else tables[table].push(structuredClone(item))
        }
        return Promise.resolve({ data: null, error: null })
      },
      delete() {
        return writeBuilder(table, (rows, predicate) => rows.filter((row) => !predicate(row)))
      },
    }
  }

  // Simula bump_org_version(): incrementa organizations[0].version si coincide con p_expected, o
  // devuelve null (sin tocar nada) si no — igual que la función SQL real. Promesa directa, sin
  // .returns(): bumpVersion() en supabaseRepository.ts la espera tal cual (mismo patrón que
  // perfiles_para_acceso() en CompanyGate.tsx).
  function rpc(name: string, params: Record<string, unknown>) {
    if (name !== 'bump_org_version') throw new Error(`rpc no simulada: ${name}`)
    const org = tables.organizations[0]
    const matches = Boolean(org) && org.version === params.p_expected
    if (matches) org.version = (org.version as number) + 1
    return Promise.resolve({ data: matches ? org.version : null, error: null })
  }

  return { tables, client: { from, rpc } as unknown as SupabaseClient }
}

function seedFor(overrides: Partial<Tables> = {}): Tables {
  return {
    organizations: [
      {
        id: 'org-1',
        name: 'Agrorifer',
        default_annual_days: 23,
        workweek: [1, 2, 3, 4, 5, 6],
        version: 1,
      },
    ],
    employees: [
      {
        id: 'emp-1',
        email: 'a@x.local',
        first_name: 'Ana',
        last_name: 'García',
        role: 'admin',
        is_seasonal: false,
      },
    ],
    activity_periods: [
      { id: 'per-1', employee_id: 'emp-1', start_date: '2020-01-01', end_date: null },
    ],
    holidays: [],
    allowances: [],
    vacation_requests: [],
    vacation_request_days: [],
    request_comments: [],
    ...overrides,
  }
}

describe('supabaseRepository', () => {
  let fake: ReturnType<typeof makeFakeSupabase>

  beforeEach(() => {
    fake = makeFakeSupabase(seedFor())
  })

  it('load() ensambla el Database desde las tablas', async () => {
    const repository = createSupabaseRepository(fake.client)
    const database = await repository.load()
    expect(database?.settings.organizationName).toBe('Agrorifer')
    expect(database?.employees[0]).toMatchObject({ id: 'emp-1', firstName: 'Ana' })
  })

  it('load() falla con claridad si no hay ninguna empresa visible', async () => {
    fake = makeFakeSupabase(seedFor({ organizations: [] }))
    const repository = createSupabaseRepository(fake.client)
    await expect(repository.load()).rejects.toThrow('No se encuentra la empresa')
  })

  it('save() solo escribe organizations cuando cambian los ajustes', async () => {
    const repository = createSupabaseRepository(fake.client)
    const database = await repository.load()
    if (!database) throw new Error('no cargó')

    await repository.save({
      ...database,
      settings: { ...database.settings, defaultAnnualDays: 25 },
    })

    expect(fake.tables.organizations[0]?.default_annual_days).toBe(25)
    expect(fake.tables.employees).toEqual(seedFor().employees)
  })

  it('save() sustituye los periodos de actividad del empleado que cambió', async () => {
    const repository = createSupabaseRepository(fake.client)
    const database = await repository.load()
    if (!database) throw new Error('no cargó')

    const closed = {
      ...database,
      employees: database.employees.map((employee) =>
        employee.id === 'emp-1'
          ? {
              ...employee,
              activityPeriods: [{ id: 'per-1', start: '2020-01-01', end: '2026-06-15' }],
            }
          : employee,
      ),
    }
    await repository.save(closed)

    expect(fake.tables.activity_periods).toEqual([
      { id: 'per-1', employee_id: 'emp-1', start_date: '2020-01-01', end_date: '2026-06-15' },
    ])
  })

  it('save() inserta una solicitud nueva con sus días y comentarios', async () => {
    const repository = createSupabaseRepository(fake.client)
    const database = await repository.load()
    if (!database) throw new Error('no cargó')

    const withRequest: Database = {
      ...database,
      requests: [
        {
          id: 'req-1',
          employeeId: 'emp-1',
          year: 2026,
          days: ['2026-06-01', '2026-06-02'],
          status: 'pendiente',
          createdBy: 'emp-1',
          createdAt: '2026-01-01T00:00:00.000Z',
          resolvedBy: null,
          resolvedAt: null,
          comments: [
            {
              id: 'cmt-1',
              authorId: 'emp-1',
              authorName: 'Ana García',
              text: 'Puente',
              createdAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          batchId: null,
        },
      ],
    }
    await repository.save(withRequest)

    expect(fake.tables.vacation_requests).toHaveLength(1)
    expect(fake.tables.vacation_request_days).toEqual([
      { request_id: 'req-1', day: '2026-06-01' },
      { request_id: 'req-1', day: '2026-06-02' },
    ])
    expect(fake.tables.request_comments).toEqual([
      {
        id: 'cmt-1',
        request_id: 'req-1',
        author_id: 'emp-1',
        author_name: 'Ana García',
        body: 'Puente',
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ])
  })

  it('save() borra una solicitud eliminada', async () => {
    fake = makeFakeSupabase(
      seedFor({
        vacation_requests: [
          {
            id: 'req-1',
            employee_id: 'emp-1',
            year: 2026,
            status: 'pendiente',
            created_by: 'emp-1',
            created_at: '2026-01-01T00:00:00.000Z',
            resolved_by: null,
            resolved_at: null,
            batch_id: null,
          },
        ],
      }),
    )
    const repository = createSupabaseRepository(fake.client)
    const database = await repository.load()
    if (!database) throw new Error('no cargó')

    await repository.save({ ...database, requests: [] })
    expect(fake.tables.vacation_requests).toEqual([])
  })

  it('save() con allowances: upsert por clave compuesta y borrado', async () => {
    fake = makeFakeSupabase(
      seedFor({ allowances: [{ employee_id: 'emp-1', year: 2025, days: 20 }] }),
    )
    const repository = createSupabaseRepository(fake.client)
    const database = await repository.load()
    if (!database) throw new Error('no cargó')

    await repository.save({
      ...database,
      allowances: [{ employeeId: 'emp-1', year: 2026, days: 18 }],
    })

    expect(fake.tables.allowances).toEqual([{ employee_id: 'emp-1', year: 2026, days: 18 }])
  })

  it('save() serializa dos escrituras seguidas sin perder ninguna', async () => {
    const repository = createSupabaseRepository(fake.client)
    const database = await repository.load()
    if (!database) throw new Error('no cargó')

    const first = repository.save({
      ...database,
      settings: { ...database.settings, organizationName: 'Primero' },
    })
    const second = repository.save({
      ...database,
      settings: { ...database.settings, organizationName: 'Primero', defaultAnnualDays: 20 },
    })
    await Promise.all([first, second])

    expect(fake.tables.organizations[0]).toMatchObject({
      name: 'Primero',
      default_annual_days: 20,
    })
  })

  it('clear() se rechaza: el modo empresa no borra la empresa desde la aplicación', async () => {
    const repository = createSupabaseRepository(fake.client)
    await expect(repository.clear()).rejects.toThrow('no borra la empresa')
  })

  it('save() lanza ConcurrencyError si otro guardado se adelantó', async () => {
    // Dos repositorios contra la misma tabla, simulando dos pestañas/administradores.
    const repoA = createSupabaseRepository(fake.client)
    const repoB = createSupabaseRepository(fake.client)
    const dbA = await repoA.load()
    const dbB = await repoB.load()
    if (!dbA || !dbB) throw new Error('no cargó')

    await repoA.save({
      ...dbA,
      settings: { ...dbA.settings, organizationName: 'Cambiado por A' },
    })

    await expect(
      repoB.save({ ...dbB, settings: { ...dbB.settings, organizationName: 'Cambiado por B' } }),
    ).rejects.toBeInstanceOf(ConcurrencyError)

    // El guardado de B no llegó a tocar nada: sigue el nombre que dejó A.
    expect(fake.tables.organizations[0]?.name).toBe('Cambiado por A')
  })

  it('load() pagina una tabla que supera las 1000 filas por página', async () => {
    // vacation_request_days es la más expuesta: crece con cada día de cada solicitud de cada
    // año. Sin paginar, PostgREST cortaría en la fila 1000 y esta solicitud se cargaría con
    // menos días de los que tiene de verdad.
    const days = Array.from({ length: 1500 }, (_, index) => ({
      request_id: 'req-1',
      day: `day-${index}`,
    }))
    fake = makeFakeSupabase(
      seedFor({
        vacation_requests: [
          {
            id: 'req-1',
            employee_id: 'emp-1',
            year: 2026,
            status: 'pendiente',
            created_by: 'emp-1',
            created_at: '2026-01-01T00:00:00.000Z',
            resolved_by: null,
            resolved_at: null,
            batch_id: null,
          },
        ],
        vacation_request_days: days,
      }),
    )
    const repository = createSupabaseRepository(fake.client)
    const database = await repository.load()

    expect(database?.requests[0]?.days).toHaveLength(1500)
  })
})

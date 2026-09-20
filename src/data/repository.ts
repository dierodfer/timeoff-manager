import type { Database } from '../domain/types'

export interface VacationRepository {
  load(): Promise<Database | null>
  save(database: Database): Promise<void>
  clear(): Promise<void>
}

export const SCHEMA_VERSION = 2

export interface StoredDatabase {
  version: number
  savedAt: string
  data: Database
}

/** Lanzado por `save()` en modo empresa cuando otro guardado se adelantó (bloqueo optimista de
 * `supabaseRepository.ts`, ver CLAUDE.md «El modo empresa»). Vive aquí y no en
 * `supabaseRepository.ts` para que `AppStore.tsx` —que sirve los dos modos— pueda comprobarla con
 * `instanceof` sin que eso arrastre `@supabase/supabase-js` al bundle de quien entra en modo
 * local (ver la nota «Perezosas» de `App.tsx`). */
export class ConcurrencyError extends Error {
  constructor() {
    super('Alguien más ha guardado cambios justo antes.')
    this.name = 'ConcurrencyError'
  }
}

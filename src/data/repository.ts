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

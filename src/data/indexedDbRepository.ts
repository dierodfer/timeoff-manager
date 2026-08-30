import { clear, createStore, get, set } from 'idb-keyval'
import type { Database } from '../domain/types'
import { SCHEMA_VERSION, type StoredDatabase, type VacationRepository } from './repository'

const store = createStore('timeoff-manager', 'state')
const KEY = 'database'

export const indexedDbRepository: VacationRepository = {
  async load() {
    const stored = await get<StoredDatabase>(KEY, store)
    if (!stored) return null
    return migrate(stored)
  },

  async save(database: Database) {
    const stored: StoredDatabase = {
      version: SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      data: database,
    }
    await set(KEY, stored, store)
  },

  async clear() {
    await clear(store)
  },
}

function migrate(stored: StoredDatabase): Database {
  return stored.data
}

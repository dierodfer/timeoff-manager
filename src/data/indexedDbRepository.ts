import { clear, createStore, get, set } from 'idb-keyval'
import type { Database } from '../domain/types'
import { SCHEMA_VERSION, type StoredDatabase, type VacationRepository } from './repository'

const store = createStore('timeoff-manager', 'state')
const KEY = 'database'

/**
 * El volumen de datos es pequeño —una plantilla y sus días de vacaciones— así
 * que se guarda el conjunto completo como un único documento JSON. Evita tener
 * que coordinar escrituras entre colecciones y hace trivial la copia de
 * seguridad.
 */
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
  // Solo existe la versión 1. Cuando aparezcan más, encadenar aquí las
  // transformaciones de una versión a la siguiente.
  return stored.data
}

import type { Database } from '../domain/types'

/**
 * Punto único de acceso a los datos. La interfaz de usuario nunca habla con
 * IndexedDB directamente, de modo que cambiar el almacenamiento por uno remoto
 * (por ejemplo un backend compartido) sea sustituir esta implementación.
 */
export interface VacationRepository {
  /** Devuelve la base de datos guardada o `null` si el dispositivo está vacío. */
  load(): Promise<Database | null>
  save(database: Database): Promise<void>
  clear(): Promise<void>
}

/** Versión del formato guardado, para poder migrar datos antiguos más adelante. */
export const SCHEMA_VERSION = 1

export interface StoredDatabase {
  version: number
  savedAt: string
  data: Database
}

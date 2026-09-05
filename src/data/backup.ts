import type { Database } from '../domain/types'
import { migrateStored, type StoredDatabaseV1 } from './migrations'
import { SCHEMA_VERSION, type StoredDatabase } from './repository'

export function backupFileName(date = new Date()): string {
  return `vacaciones-${date.toISOString().slice(0, 10)}.json`
}

export function serializeBackup(database: Database): string {
  const payload: StoredDatabase = {
    version: SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    data: database,
  }
  return JSON.stringify(payload, null, 2)
}

export function downloadBackup(database: Database): void {
  const blob = new Blob([serializeBackup(database)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = backupFileName()
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export class BackupFormatError extends Error {}

function isArrayOfObjects(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'object' && item !== null)
}

export function parseBackup(text: string): Database {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new BackupFormatError('El fichero no contiene JSON válido.')
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new BackupFormatError('El fichero no tiene el formato esperado.')
  }

  const stored = parsed as Partial<StoredDatabase>
  if (typeof stored.version !== 'number') {
    throw new BackupFormatError('El fichero no parece una copia de seguridad de esta aplicación.')
  }
  if (stored.version > SCHEMA_VERSION) {
    throw new BackupFormatError(
      `La copia se hizo con una versión más reciente (v${stored.version}). Actualiza la aplicación antes de importarla.`,
    )
  }

  const data = stored.data as Partial<Database> | undefined
  if (
    !data ||
    typeof data.settings !== 'object' ||
    data.settings === null ||
    !isArrayOfObjects(data.employees) ||
    !isArrayOfObjects(data.holidays) ||
    !isArrayOfObjects(data.requests) ||
    !isArrayOfObjects(data.allowances)
  ) {
    throw new BackupFormatError('Faltan datos en la copia de seguridad o están dañados.')
  }

  return migrateStored({ version: stored.version, savedAt: stored.savedAt ?? '', data } as
    StoredDatabase | StoredDatabaseV1)
}

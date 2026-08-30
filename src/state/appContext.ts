import { createContext, useContext } from 'react'
import type { FirstRunInput } from '../data/seed'
import type { Database, Employee } from '../domain/types'
import type { WorkCalendar } from '../domain/workdays'
import type { Outcome } from './actions'

export type Status = 'loading' | 'empty' | 'ready'

export interface Toast {
  id: number
  message: string
  tone: 'success' | 'error'
}

export interface AppContextValue {
  status: Status
  database: Database | null
  currentUser: Employee | null
  year: number
  calendar: WorkCalendar
  toasts: Toast[]
  setYear: (year: number) => void
  notify: (message: string, tone?: Toast['tone']) => void
  dismissToast: (id: number) => void
  bootstrap: (input: FirstRunInput) => Promise<void>
  signIn: (employeeId: string, pin: string) => Promise<boolean>
  signOut: () => void
  /** Guarda y refresca al instante; la escritura en disco va por detrás y avisa si falla. */
  commit: (next: Database) => void
  /** Síncrona a propósito: esperar al disco dejaba la selección anterior a la vista. */
  apply: (mutation: (database: Database) => Outcome) => boolean
  replaceDatabase: (next: Database) => void
  wipe: () => Promise<void>
}

export const AppContext = createContext<AppContextValue | null>(null)

export function useApp(): AppContextValue {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp debe usarse dentro de AppProvider')
  return context
}

export function useSession() {
  const app = useApp()
  if (!app.database || !app.currentUser) {
    throw new Error('useSession requiere datos cargados y sesión iniciada')
  }
  return { ...app, database: app.database, currentUser: app.currentUser }
}

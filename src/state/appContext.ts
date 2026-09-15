import { createContext, useContext } from 'react'
import type { FirstRunInput } from '../data/seed'
import type { ActivityPeriod, Database, Employee, Role } from '../domain/types'
import type { WorkCalendar } from '../domain/workdays'
import type { Outcome } from './actions'

export type Mode = 'local' | 'empresa'

export type Status = 'loading' | 'empty' | 'ready' | 'error'

export interface Toast {
  id: number
  message: string
  tone: 'success' | 'error'
}

/** Los campos de un empleado que edita el formulario, sin el secreto ni lo que decide el modo. */
export interface EmployeeFields {
  firstName: string
  lastName: string
  role: Role
  isSeasonal: boolean
  activityPeriods: ActivityPeriod[]
}

export interface AppContextValue {
  mode: Mode
  status: Status
  /** Mensaje de `status === 'error'`: por qué falló la carga contra Supabase. */
  error: string | null
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
  wipe: () => Promise<void>
  /**
   * Da de alta un empleado con el secreto de acceso inicial (PIN en local, contraseña en
   * empresa). Un solo método para las dos pantallas: quien llama no sabe ni le importa contra
   * qué backend habla.
   */
  createEmployee: (fields: EmployeeFields, secret: string) => Promise<boolean>
  /**
   * Actualiza los datos de un empleado existente y, si `secret` no está vacío, también su
   * acceso. Vacío significa «no cambiarlo», en los dos modos.
   */
  updateEmployee: (employeeId: string, fields: EmployeeFields, secret: string) => Promise<boolean>
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

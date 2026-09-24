import type { SupabaseClient } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ConcurrencyError, type VacationRepository } from '../data/repository'
import { hashPin, randomSalt, verifyPin } from '../data/pin'
import {
  createInitialDatabase,
  createEmployee as createLocalEmployee,
  type FirstRunInput,
} from '../data/seed'
import { callCambiarPassword, callCrearEmpleado } from '../data/supabaseFunctions'
import { resolveCurrentEmployeeId } from '../data/supabaseSession'
import type { Database, Employee } from '../domain/types'
import { buildWorkCalendar, type WorkCalendar } from '../domain/workdays'
import type { Outcome } from './actions'
import {
  AppContext,
  type AppContextValue,
  type EmployeeFields,
  type Mode,
  type Status,
  type Toast,
} from './appContext'

const SESSION_KEY = 'timeoff:user'

const EMPTY_CALENDAR: WorkCalendar = {
  workweek: new Set([1, 2, 3, 4, 5, 6]),
  holidaysByDate: new Map(),
}

let lastToastId = 0

interface AppProviderProps {
  readonly children: ReactNode
  /** El repositorio decide contra qué habla `commit()`: IndexedDB en local, Supabase en empresa. */
  readonly repository: VacationRepository
  readonly mode: Mode
  /** Solo en modo empresa: para la sesión de Auth y las Edge Functions de alta/contraseña. */
  readonly supabase?: SupabaseClient
}

export function AppProvider({ children, repository, mode, supabase }: AppProviderProps) {
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState<string | null>(null)
  const [database, setDatabase] = useState<Database | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    let cancelled = false

    const identify = mode === 'empresa' && supabase ? resolveCurrentEmployeeId(supabase) : null

    Promise.all([repository.load(), identify])
      .then(([loaded, employeeId]) => {
        if (cancelled) return
        setDatabase(loaded)
        setStatus(loaded ? 'ready' : 'empty')
        if (employeeId) {
          setCurrentUserId(employeeId)
        } else if (mode === 'local') {
          const remembered = sessionStorage.getItem(SESSION_KEY)
          if (loaded && remembered && loaded.employees.some((item) => item.id === remembered)) {
            setCurrentUserId(remembered)
          }
        }
      })
      .catch((loadError: unknown) => {
        if (cancelled) return
        console.error(loadError)
        setStatus('error')
        setError(
          loadError instanceof Error ? loadError.message : 'No se han podido cargar los datos.',
        )
      })
    return () => {
      cancelled = true
    }
    // El repositorio y el modo no cambian en caliente: un solo arranque.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const notify = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    lastToastId += 1
    const toast: Toast = { id: lastToastId, message, tone }
    setToasts((current) => [...current, toast].slice(-3))
    setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== toast.id))
    }, 4000)
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id))
  }, [])

  const commit = useCallback(
    (next: Database) => {
      setDatabase(next)
      void repository.save(next).catch((saveError: unknown) => {
        console.error(saveError)
        notify(
          saveError instanceof ConcurrencyError
            ? 'Alguien más ha guardado cambios justo antes. Se han recargado los datos más recientes: repite la acción.'
            : 'No se han podido guardar los cambios.',
          'error',
        )
        // Resincroniza: sin esto, la pantalla seguiría mostrando algo que no llegó a guardarse.
        void repository.load().then((reloaded) => {
          if (reloaded) setDatabase(reloaded)
        })
      })
    },
    [repository, notify],
  )

  const apply = useCallback(
    (mutation: (database: Database) => Outcome) => {
      if (!database) return false
      const outcome = mutation(database)
      if (!outcome.ok) {
        notify(outcome.reason, 'error')
        return false
      }
      commit(outcome.database)
      return true
    },
    [database, commit, notify],
  )

  const bootstrap = useCallback(
    async (input: FirstRunInput) => {
      const initial = await createInitialDatabase(input)
      commit(initial)
      setStatus('ready')
      setCurrentUserId(initial.employees[0].id)
      sessionStorage.setItem(SESSION_KEY, initial.employees[0].id)
      setYear(input.year)
    },
    [commit],
  )

  const signIn = useCallback(
    async (employeeId: string, pin: string) => {
      const employee = database?.employees.find((item) => item.id === employeeId)
      if (!employee) return false
      if (!(await verifyPin(pin, employee.pinSalt, employee.pinHash))) return false
      setCurrentUserId(employee.id)
      sessionStorage.setItem(SESSION_KEY, employee.id)
      return true
    },
    [database],
  )

  const signOut = useCallback(() => {
    if (mode === 'empresa') {
      void supabase?.auth.signOut()
      return
    }
    setCurrentUserId(null)
    sessionStorage.removeItem(SESSION_KEY)
  }, [mode, supabase])

  const wipe = useCallback(async () => {
    await repository.clear()
    setDatabase(null)
    setStatus('empty')
    setCurrentUserId(null)
    sessionStorage.removeItem(SESSION_KEY)
  }, [repository])

  const createEmployee = useCallback(
    async (fields: EmployeeFields, secret: string) => {
      if (!database) return false

      if (mode === 'empresa') {
        if (!supabase) return false
        const result = await callCrearEmpleado(supabase, {
          firstName: fields.firstName,
          lastName: fields.lastName,
          password: secret,
          role: fields.role,
          isSeasonal: fields.isSeasonal,
          activityPeriods: fields.activityPeriods.map(({ start, end }) => ({ start, end })),
        })
        if (!result.ok) {
          notify(result.message, 'error')
          return false
        }
        const reloaded = await repository.load()
        if (reloaded) setDatabase(reloaded)
        return true
      }

      const employee = await createLocalEmployee({ ...fields, pin: secret })
      commit({ ...database, employees: [...database.employees, employee] })
      return true
    },
    [database, mode, supabase, repository, commit, notify],
  )

  const updateEmployee = useCallback(
    async (employeeId: string, fields: EmployeeFields, secret: string) => {
      if (!database) return false
      const existing = database.employees.find((item) => item.id === employeeId)
      if (!existing) return false

      if (mode === 'empresa') {
        if (secret) {
          if (!supabase) return false
          const result = await callCambiarPassword(supabase, employeeId, secret)
          if (!result.ok) {
            notify(result.message, 'error')
            return false
          }
        }
        const updated: Employee = { ...existing, ...fields }
        commit({
          ...database,
          employees: database.employees.map((item) => (item.id === employeeId ? updated : item)),
        })
        return true
      }

      const pinSalt = secret ? randomSalt() : existing.pinSalt
      const pinHash = secret ? await hashPin(secret, pinSalt) : existing.pinHash
      const updated: Employee = { ...existing, ...fields, pinSalt, pinHash }
      commit({
        ...database,
        employees: database.employees.map((item) => (item.id === employeeId ? updated : item)),
      })
      return true
    },
    [database, mode, supabase, commit, notify],
  )

  const calendar = useMemo(
    () => (database ? buildWorkCalendar(database.holidays, database.settings) : EMPTY_CALENDAR),
    [database],
  )

  const currentUser = useMemo(
    () => database?.employees.find((item) => item.id === currentUserId) ?? null,
    [database, currentUserId],
  )

  const value = useMemo<AppContextValue>(
    () => ({
      mode,
      status,
      error,
      database,
      currentUser,
      year,
      calendar,
      toasts,
      setYear,
      notify,
      dismissToast,
      bootstrap,
      signIn,
      signOut,
      commit,
      apply,
      wipe,
      createEmployee,
      updateEmployee,
    }),
    [
      mode,
      status,
      error,
      database,
      currentUser,
      year,
      calendar,
      toasts,
      notify,
      dismissToast,
      bootstrap,
      signIn,
      signOut,
      commit,
      apply,
      wipe,
      createEmployee,
      updateEmployee,
    ],
  )

  return <AppContext value={value}>{children}</AppContext>
}

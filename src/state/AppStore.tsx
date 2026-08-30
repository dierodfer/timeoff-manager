import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { indexedDbRepository } from '../data/indexedDbRepository'
import { verifyPin } from '../data/pin'
import { createInitialDatabase, type FirstRunInput } from '../data/seed'
import type { Database } from '../domain/types'
import { buildWorkCalendar, type WorkCalendar } from '../domain/workdays'
import { applyTheme, readTheme, type Theme } from '../ui/theme'
import type { Outcome } from './actions'
import { AppContext, type AppContextValue, type Status, type Toast } from './appContext'

const SESSION_KEY = 'timeoff:user'

const EMPTY_CALENDAR: WorkCalendar = {
  workweek: new Set([1, 2, 3, 4, 5, 6]),
  holidaysByDate: new Map(),
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [database, setDatabase] = useState<Database | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [toasts, setToasts] = useState<Toast[]>([])
  const [theme, setThemeState] = useState<Theme>(readTheme)

  useEffect(() => {
    let cancelled = false
    void indexedDbRepository.load().then((loaded) => {
      if (cancelled) return
      setDatabase(loaded)
      setStatus(loaded ? 'ready' : 'empty')
      const remembered = sessionStorage.getItem(SESSION_KEY)
      if (loaded && remembered && loaded.employees.some((item) => item.id === remembered)) {
        setCurrentUserId(remembered)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const notify = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const toast: Toast = { id: Date.now() + Math.random(), message, tone }
    setToasts((current) => [...current, toast].slice(-3))
    setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== toast.id))
    }, 4000)
  }, [])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    applyTheme(next)
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id))
  }, [])

  const commit = useCallback(
    (next: Database) => {
      setDatabase(next)
      void indexedDbRepository.save(next).catch((error: unknown) => {
        console.error(error)
        notify('No se han podido guardar los cambios en este navegador.', 'error')
      })
    },
    [notify],
  )

  const apply = useCallback(
    (mutation: (database: Database) => Outcome) => {
      if (!database) return false
      const outcome = mutation(database)
      if (!outcome.ok) {
        notify(outcome.reason, 'error')
        return false
      }
      void commit(outcome.database)
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
    setCurrentUserId(null)
    sessionStorage.removeItem(SESSION_KEY)
  }, [])

  const replaceDatabase = useCallback(
    (next: Database) => {
      commit(next)
      setStatus('ready')
      setCurrentUserId(null)
      sessionStorage.removeItem(SESSION_KEY)
    },
    [commit],
  )

  const wipe = useCallback(async () => {
    await indexedDbRepository.clear()
    setDatabase(null)
    setStatus('empty')
    setCurrentUserId(null)
    sessionStorage.removeItem(SESSION_KEY)
  }, [])

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
      status,
      database,
      currentUser,
      year,
      calendar,
      toasts,
      setYear,
      theme,
      setTheme,
      notify,
      dismissToast,
      bootstrap,
      signIn,
      signOut,
      commit,
      apply,
      replaceDatabase,
      wipe,
    }),
    [
      status,
      database,
      currentUser,
      year,
      calendar,
      toasts,
      theme,
      setTheme,
      notify,
      dismissToast,
      bootstrap,
      signIn,
      signOut,
      commit,
      apply,
      replaceDatabase,
      wipe,
    ],
  )

  return <AppContext value={value}>{children}</AppContext>
}

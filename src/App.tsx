import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { BulkAssign } from './pages/BulkAssign'
import { Employees } from './pages/Employees'
import { FirstRun } from './pages/FirstRun'
import { MyCalendar } from './pages/MyCalendar'
import { Planning } from './pages/Planning'
import { Requests } from './pages/Requests'
import { SettingsPage } from './pages/SettingsPage'
import { SignIn } from './pages/SignIn'
import { useApp } from './state/appContext'
import { AppShell } from './ui/AppShell'
import { Toasts } from './ui/Toasts'

export default function App() {
  return (
    <>
      <CurrentScreen />
      <Toasts />
    </>
  )
}

function CurrentScreen() {
  const { status, database, currentUser } = useApp()

  if (status === 'loading') return <Splash />
  if (!database) return <FirstRun />
  if (!currentUser) return <SignIn />

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<MyCalendar />} />
        <Route
          path="planificacion"
          element={
            <AdminOnly>
              <Planning />
            </AdminOnly>
          }
        />
        <Route
          path="solicitudes"
          element={
            <AdminOnly>
              <Requests />
            </AdminOnly>
          }
        />
        <Route
          path="empleados"
          element={
            <AdminOnly>
              <Employees />
            </AdminOnly>
          }
        />
        <Route
          path="asignacion"
          element={
            <AdminOnly>
              <BulkAssign />
            </AdminOnly>
          }
        />
        <Route
          path="ajustes"
          element={
            <AdminOnly>
              <SettingsPage />
            </AdminOnly>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

function AdminOnly({ children }: { readonly children: ReactNode }) {
  const { currentUser } = useApp()
  if (currentUser?.role !== 'admin') return <Navigate to="/" replace />
  return <>{children}</>
}

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <p className="text-sm text-[var(--color-ink-muted)]">Cargando…</p>
    </div>
  )
}

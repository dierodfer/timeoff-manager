import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { isCompanySlug } from './domain/orgSlug'
import { BulkAssign } from './pages/BulkAssign'
import { CompanySignIn } from './pages/CompanySignIn'
import { Employees } from './pages/Employees'
import { FirstRun } from './pages/FirstRun'
import { MyCalendar } from './pages/MyCalendar'
import { MyRequests } from './pages/MyRequests'
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
  // El primer tramo de la URL decide el modo: si no es ninguna de las rutas locales de
  // abajo, se trata como el slug de una empresa y entra por Supabase en vez de por
  // IndexedDB. isCompanySlug() es la misma lista que prohíbe supabase/schema.sql como
  // organizations.slug, para que un slug nunca quede detrás de una ruta local.
  const { pathname } = useLocation()
  const firstSegment = pathname.split('/')[1] ?? ''
  if (isCompanySlug(firstSegment)) return <CompanySignIn slug={firstSegment} />
  return <LocalApp />
}

function LocalApp() {
  const { status, database, currentUser } = useApp()

  if (status === 'loading') return <Splash />
  if (!database) return <FirstRun />
  if (!currentUser) return <SignIn />

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<MyCalendar />} />
        <Route path="mis-solicitudes" element={<MyRequests />} />
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

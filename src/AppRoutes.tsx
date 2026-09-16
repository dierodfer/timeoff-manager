import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { MyCalendar } from './pages/MyCalendar'
import { MyRequests } from './pages/MyRequests'
import { useApp } from './state/appContext'
import { AppShell } from './ui/AppShell'

// Perezosas: un empleado normal no descarga react-datepicker ni react-day-picker, que no puede abrir.
const BulkAssign = lazy(() => import('./pages/BulkAssign').then((m) => ({ default: m.BulkAssign })))
const Employees = lazy(() => import('./pages/Employees').then((m) => ({ default: m.Employees })))
const Holidays = lazy(() => import('./pages/Holidays').then((m) => ({ default: m.Holidays })))
const Planning = lazy(() => import('./pages/Planning').then((m) => ({ default: m.Planning })))
const Requests = lazy(() => import('./pages/Requests').then((m) => ({ default: m.Requests })))
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)

/** Las rutas de quien ya tiene sesión: iguales en modo local y en modo empresa. */
export function AuthenticatedRoutes() {
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
          path="festivos"
          element={
            <AdminOnly>
              <Holidays />
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

// El Suspense va aquí, no envolviendo a <Routes>: así la cabecera y la barra se quedan a la
// vista mientras llega el trozo, en vez de parpadear la página entera.
function AdminOnly({ children }: { readonly children: ReactNode }) {
  const { currentUser } = useApp()
  if (currentUser?.role !== 'admin') return <Navigate to="/" replace />
  return <Suspense fallback={<PageLoading />}>{children}</Suspense>
}

function PageLoading() {
  return <p className="py-16 text-center text-sm text-[var(--color-ink-muted)]">Cargando…</p>
}

import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { MyCalendar } from './pages/MyCalendar'
import { MyRequests } from './pages/MyRequests'
import { useApp } from './state/appContext'
import { AppShell } from './ui/AppShell'

// Perezosas: las cinco pantallas de administrador. Un empleado normal solo usa Mi calendario y
// Mis solicitudes, y sin esto se descargaba también react-datepicker (Empleados) y
// react-day-picker (Asignación masiva), que no puede abrir.
const BulkAssign = lazy(() => import('./pages/BulkAssign').then((m) => ({ default: m.BulkAssign })))
const Employees = lazy(() => import('./pages/Employees').then((m) => ({ default: m.Employees })))
const Planning = lazy(() => import('./pages/Planning').then((m) => ({ default: m.Planning })))
const Requests = lazy(() => import('./pages/Requests').then((m) => ({ default: m.Requests })))
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)

/**
 * Las rutas de quien ya tiene datos cargados y sesión iniciada: iguales en modo local y en modo
 * empresa, montadas bajo el `basename` que ya resolvió `main.tsx` (raíz en local, `/<slug>` en
 * empresa), así que ningún `to`/`path` de aquí sabe en qué modo está.
 */
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

// El Suspense va aquí, dentro de AppShell, y no envolviendo a <Routes>: así la cabecera y la
// barra lateral se quedan a la vista mientras llega el trozo de la pantalla, en vez de
// parpadear la página entera. Todas las rutas perezosas son justo las de administrador.
function AdminOnly({ children }: { readonly children: ReactNode }) {
  const { currentUser } = useApp()
  if (currentUser?.role !== 'admin') return <Navigate to="/" replace />
  return <Suspense fallback={<PageLoading />}>{children}</Suspense>
}

function PageLoading() {
  return <p className="py-16 text-center text-sm text-[var(--color-ink-muted)]">Cargando…</p>
}

import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { isCompanySlug } from './domain/orgSlug'
import { MyCalendar } from './pages/MyCalendar'
import { MyRequests } from './pages/MyRequests'
import { SignIn } from './pages/SignIn'
import { useApp } from './state/appContext'
import { AppShell } from './ui/AppShell'
import { Toasts } from './ui/Toasts'

// Perezosas: las pantallas de administrador, la primera configuración y el acceso de una
// empresa. Un empleado solo usa Mi calendario y Mis solicitudes, y sin esto se descargaba
// también react-datepicker (Empleados), react-day-picker (Asignación masiva) y el cliente
// de Supabase, que no puede abrir. Lo que queda cargándose de entrada es lo que ve todo
// el mundo: el acceso, la cabecera y esas dos pantallas.
const BulkAssign = lazy(() => import('./pages/BulkAssign').then((m) => ({ default: m.BulkAssign })))
const CompanySignIn = lazy(() =>
  import('./pages/CompanySignIn').then((m) => ({ default: m.CompanySignIn })),
)
const Employees = lazy(() => import('./pages/Employees').then((m) => ({ default: m.Employees })))
const FirstRun = lazy(() => import('./pages/FirstRun').then((m) => ({ default: m.FirstRun })))
const Planning = lazy(() => import('./pages/Planning').then((m) => ({ default: m.Planning })))
const Requests = lazy(() => import('./pages/Requests').then((m) => ({ default: m.Requests })))
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)

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
  if (isCompanySlug(firstSegment)) {
    return (
      <Suspense fallback={<Splash />}>
        <CompanySignIn slug={firstSegment} />
      </Suspense>
    )
  }
  return <LocalApp />
}

function LocalApp() {
  const { status, database, currentUser } = useApp()

  if (status === 'loading') return <Splash />
  if (!database) {
    return (
      <Suspense fallback={<Splash />}>
        <FirstRun />
      </Suspense>
    )
  }
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

// El Suspense va aquí, dentro de AppShell, y no envolviendo a <Routes>: así la cabecera y
// la barra lateral se quedan a la vista mientras llega el trozo de la pantalla, en vez de
// parpadear la página entera. Todas las rutas perezosas son justo las de administrador.
function AdminOnly({ children }: { readonly children: ReactNode }) {
  const { currentUser } = useApp()
  if (currentUser?.role !== 'admin') return <Navigate to="/" replace />
  return <Suspense fallback={<PageLoading />}>{children}</Suspense>
}

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <p className="text-sm text-[var(--color-ink-muted)]">Cargando…</p>
    </div>
  )
}

/** Como Splash, pero dentro del marco de la aplicación: no ocupa la pantalla entera. */
function PageLoading() {
  return <p className="py-16 text-center text-sm text-[var(--color-ink-muted)]">Cargando…</p>
}

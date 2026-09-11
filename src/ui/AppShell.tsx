import {
  Bell,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Menu as MenuIcon,
  Settings,
  Sprout,
  Users,
} from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { pendingDaysInYear } from '../domain/balance'
import { useSession } from '../state/appContext'
import type { NavItem } from './AppSidebar'
import { LocalModeBadge } from './LocalModeBadge'
import { UserMenu } from './UserMenu'

// Perezosa: se lleva con ella react-pro-sidebar y su emotion, que son de lo más pesado
// del bundle y solo hacen falta si quien entra es administrador.
const AppSidebar = lazy(() => import('./AppSidebar').then((m) => ({ default: m.AppSidebar })))

const LINKS: (NavItem & { adminOnly?: boolean })[] = [
  { to: '/', label: 'Mi calendario', icon: CalendarDays },
  { to: '/planificacion', label: 'Planificación', icon: CalendarRange, adminOnly: true },
  { to: '/empleados', label: 'Empleados', icon: Users, adminOnly: true },
  { to: '/ajustes', label: 'Ajustes', icon: Settings, adminOnly: true },
]

export function AppShell() {
  const { database, currentUser, year, setYear } = useSession()
  const [toggled, setToggled] = useState(false)
  const { pathname } = useLocation()
  const isAdmin = currentUser.role === 'admin'
  const links = LINKS.filter((link) => isAdmin || !link.adminOnly)
  const pendingCount = pendingDaysInYear(database.requests, year)

  return (
    <div className="flex min-h-dvh">
      {isAdmin && (
        <Suspense fallback={null}>
          <AppSidebar
            organizationName={database.settings.organizationName}
            links={links}
            pathname={pathname}
            toggled={toggled}
            onClose={() => setToggled(false)}
          />
        </Suspense>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass hairline sticky top-0 z-30 flex items-center gap-3 border-b px-4 py-3 sm:px-6">
          {isAdmin ? (
            <button
              type="button"
              className="icon-btn lg:hidden"
              aria-label="Abrir el menú"
              onClick={() => setToggled(true)}
            >
              <MenuIcon className="size-5" />
            </button>
          ) : (
            <p className="flex min-w-0 items-center gap-2.5 text-[15px] font-semibold">
              <span className="badge-icon badge-icon-sm">
                <Sprout className="size-5" />
              </span>
              <span className="truncate max-sm:hidden">{database.settings.organizationName}</span>
            </p>
          )}

          <div className="year-picker">
            <button type="button" aria-label="Año anterior" onClick={() => setYear(year - 1)}>
              <ChevronLeft className="size-4" />
            </button>
            <span className="tabular">{year}</span>
            <button type="button" aria-label="Año siguiente" onClick={() => setYear(year + 1)}>
              <ChevronRight className="size-4" />
            </button>
          </div>

          <span className="ml-auto flex items-center gap-2">
            <LocalModeBadge />
            {isAdmin && (
              <NavLink
                to="/solicitudes"
                className="icon-btn relative"
                aria-label={
                  pendingCount > 0
                    ? `Solicitudes pendientes: ${pendingCount}`
                    : 'Solicitudes pendientes'
                }
              >
                <Bell className="size-5" />
                {pendingCount > 0 && (
                  <span className="notification-dot tabular">
                    {pendingCount > 99 ? '99+' : pendingCount}
                  </span>
                )}
              </NavLink>
            )}
            <UserMenu />
          </span>
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-8 sm:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

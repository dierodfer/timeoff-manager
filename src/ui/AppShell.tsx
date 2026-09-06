import {
  Bell,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu as MenuIcon,
  Settings,
  Sprout,
  Users,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Menu, MenuItem, Sidebar } from 'react-pro-sidebar'
import { displayName } from '../state/actions'
import { useSession } from '../state/appContext'
import { Avatar } from './Avatar'

interface NavItem {
  to: string
  label: string
  end: boolean
  icon: ComponentType<{ className?: string }>
}

const EMPLOYEE_LINKS: NavItem[] = [
  { to: '/', label: 'Mi calendario', end: true, icon: CalendarDays },
]

const ADMIN_LINKS: NavItem[] = [
  { to: '/', label: 'Mi calendario', end: true, icon: CalendarDays },
  { to: '/planificacion', label: 'Planificación', end: false, icon: CalendarRange },
  { to: '/empleados', label: 'Empleados', end: false, icon: Users },
  { to: '/ajustes', label: 'Ajustes', end: false, icon: Settings },
]

export function AppShell() {
  const { database, currentUser, year, setYear, signOut } = useSession()
  const [toggled, setToggled] = useState(false)
  const location = useLocation()
  const links = currentUser.role === 'admin' ? ADMIN_LINKS : EMPLOYEE_LINKS

  const pendingCount = database.requests
    .filter((request) => request.status === 'pendiente' && request.year === year)
    .reduce((total, request) => total + request.days.length, 0)

  const isCurrent = (link: NavItem) =>
    link.end ? location.pathname === link.to : location.pathname.startsWith(link.to)

  return (
    <div className="flex min-h-dvh">
      <Sidebar
        breakPoint="lg"
        toggled={toggled}
        onBackdropClick={() => setToggled(false)}
        width="264px"
        backgroundColor="var(--color-surface)"
        rootStyles={{ borderColor: 'var(--color-hairline)' }}
        className="sidebar"
      >
        <div className="flex min-h-dvh flex-col">
          <p className="flex items-center gap-2.5 px-5 py-5 text-[17px] font-semibold">
            <span className="sidebar-logo">
              <Sprout className="size-5" />
            </span>
            <span className="truncate">{database.settings.organizationName}</span>
          </p>

          <Menu
            className="px-2"
            menuItemStyles={{
              button: ({ active }) => ({
                height: '42px',
                borderRadius: '10px',
                paddingLeft: '12px',
                paddingRight: '12px',
                fontSize: '14px',
                fontWeight: active ? 600 : 500,
                color: active ? 'var(--color-accent)' : 'var(--color-ink-soft)',
                backgroundColor: active ? 'var(--color-accent-soft)' : 'transparent',
                '&:hover': {
                  backgroundColor: active
                    ? 'var(--color-accent-soft)'
                    : 'var(--color-surface-sunken)',
                  color: active ? 'var(--color-accent)' : 'var(--color-ink)',
                },
              }),
              icon: { marginRight: '10px', width: 'auto', minWidth: 'auto' },
              label: { overflow: 'visible' },
            }}
          >
            {links.map((link) => (
              <MenuItem
                key={link.to}
                active={isCurrent(link)}
                icon={<link.icon className="size-[18px]" />}
                component={<NavLink to={link.to} end={link.end} />}
                onClick={() => setToggled(false)}
              >
                {link.label}
              </MenuItem>
            ))}
          </Menu>

          <div className="mt-auto p-3">
            <div className="hairline flex items-center gap-2.5 rounded-[var(--radius-control)] border p-2.5">
              <Avatar employee={currentUser} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">
                  {displayName(currentUser)}
                </span>
                <span className="block truncate text-xs text-[var(--color-ink-muted)]">
                  {currentUser.role === 'admin' ? 'Administrador' : 'Empleado'}
                </span>
              </span>
              <button type="button" className="icon-btn" aria-label="Salir" onClick={signOut}>
                <LogOut className="size-[18px]" />
              </button>
            </div>
          </div>
        </div>
      </Sidebar>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass hairline sticky top-0 z-30 flex items-center gap-3 border-b px-4 py-3 sm:px-6">
          <button
            type="button"
            className="icon-btn lg:hidden"
            aria-label="Abrir el menú"
            onClick={() => setToggled(true)}
          >
            <MenuIcon className="size-5" />
          </button>

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
            {currentUser.role === 'admin' && (
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
            <span className="lg:hidden">
              <Avatar employee={currentUser} size="sm" />
            </span>
          </span>
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-8 sm:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

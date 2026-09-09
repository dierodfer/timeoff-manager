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
import type { ComponentType } from 'react'
import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Menu, MenuItem, Sidebar } from 'react-pro-sidebar'
import { pendingDaysInYear } from '../domain/balance'
import { useSession } from '../state/appContext'
import { LocalModeBadge } from './LocalModeBadge'
import { UserMenu } from './UserMenu'

interface NavItem {
  to: string
  label: string
  icon: ComponentType<{ className?: string }>
  adminOnly?: boolean
}

const LINKS: NavItem[] = [
  { to: '/', label: 'Mi calendario', icon: CalendarDays },
  { to: '/planificacion', label: 'Planificación', icon: CalendarRange, adminOnly: true },
  { to: '/empleados', label: 'Empleados', icon: Users, adminOnly: true },
  { to: '/ajustes', label: 'Ajustes', icon: Settings, adminOnly: true },
]

const MENU_ITEM_STYLES = {
  button: ({ active }: { active?: boolean }) => ({
    height: '42px',
    borderRadius: '10px',
    paddingLeft: '12px',
    paddingRight: '12px',
    fontSize: '14px',
    fontWeight: active ? 600 : 500,
    color: active ? 'var(--color-accent)' : 'var(--color-ink-soft)',
    backgroundColor: active ? 'var(--color-accent-soft)' : 'transparent',
    '&:hover': {
      backgroundColor: active ? 'var(--color-accent-soft)' : 'var(--color-surface-sunken)',
      color: active ? 'var(--color-accent)' : 'var(--color-ink)',
    },
  }),
  icon: { marginRight: '10px', width: 'auto', minWidth: 'auto' },
  label: { overflow: 'visible' },
}

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
        <Sidebar
          breakPoint="lg"
          toggled={toggled}
          onBackdropClick={() => setToggled(false)}
          width="264px"
          backgroundColor="var(--color-surface)"
          rootStyles={{ borderColor: 'var(--color-hairline)' }}
        >
          <div className="flex min-h-dvh flex-col">
            <p className="flex items-center gap-2.5 px-5 py-5 text-[17px] font-semibold">
              <span className="badge-icon badge-icon-sm">
                <Sprout className="size-5" />
              </span>
              <span className="truncate">{database.settings.organizationName}</span>
            </p>

            <Menu className="px-2" menuItemStyles={MENU_ITEM_STYLES}>
              {links.map((link) => (
                <MenuItem
                  key={link.to}
                  active={link.to === '/' ? pathname === '/' : pathname.startsWith(link.to)}
                  icon={<link.icon className="size-[18px]" />}
                  component={<NavLink to={link.to} end={link.to === '/'} />}
                  onClick={() => setToggled(false)}
                >
                  {link.label}
                </MenuItem>
              ))}
            </Menu>
          </div>
        </Sidebar>
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

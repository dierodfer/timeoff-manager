import { NavLink, Outlet } from 'react-router-dom'
import { displayName } from '../state/actions'
import { useSession } from '../state/appContext'
import { ThemeToggle } from './ThemeToggle'

const EMPLOYEE_LINKS = [{ to: '/', label: 'Mi calendario', end: true }]

const ADMIN_LINKS = [
  { to: '/', label: 'Mi calendario', end: true },
  { to: '/planificacion', label: 'Planificación', end: false },
  { to: '/solicitudes', label: 'Solicitudes', end: false },
  { to: '/empleados', label: 'Empleados', end: false },
  { to: '/asignacion', label: 'Asignación masiva', end: false },
  { to: '/ajustes', label: 'Ajustes', end: false },
]

export function AppShell() {
  const { database, currentUser, year, setYear, signOut } = useSession()
  const links = currentUser.role === 'admin' ? ADMIN_LINKS : EMPLOYEE_LINKS

  const pendingCount = database.requests.filter(
    (request) => request.status === 'pendiente' && request.year === year,
  ).length

  return (
    <div className="min-h-dvh">
      <header className="glass hairline sticky top-0 z-40 border-b">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold">
              {database.settings.organizationName}
            </p>
            <p className="truncate text-xs text-[var(--color-ink-muted)]">
              {displayName(currentUser)} ·{' '}
              {currentUser.role === 'admin' ? 'Administrador' : 'Empleado'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="segmented">
              <button type="button" aria-label="Año anterior" onClick={() => setYear(year - 1)}>
                ‹
              </button>
              <button type="button" aria-pressed="true" className="tabular">
                {year}
              </button>
              <button type="button" aria-label="Año siguiente" onClick={() => setYear(year + 1)}>
                ›
              </button>
            </div>

            <ThemeToggle />

            <button type="button" className="btn btn-secondary btn-sm" onClick={signOut}>
              Salir
            </button>
          </div>

          <nav className="-mx-1 flex w-full gap-1 overflow-x-auto pb-1">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  `rounded-full px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition ${
                    isActive
                      ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                      : 'text-[var(--color-ink-soft)] hover:bg-[var(--color-surface-sunken)]'
                  }`
                }
              >
                {link.label}
                {link.to === '/solicitudes' && pendingCount > 0 && (
                  <span className="tabular ml-1.5 rounded-full bg-[var(--color-pending)] px-1.5 text-[11px] text-white">
                    {pendingCount}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  )
}

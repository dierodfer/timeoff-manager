import { Sprout, type LucideProps } from 'lucide-react'
import type { ComponentType } from 'react'
import { NavLink } from 'react-router-dom'

export interface NavItem {
  to: string
  label: string
  icon: ComponentType<LucideProps>
}

interface AppSidebarProps {
  readonly organizationName: string
  readonly links: NavItem[]
  readonly toggled: boolean
  readonly onClose: () => void
}

export function AppSidebar({ organizationName, links, toggled, onClose }: AppSidebarProps) {
  return (
    <>
      {/* Fondo oscurecido del cajón en móvil; en escritorio la barra es fija y esto no se monta.
          Empieza donde acaba la barra (no inset-0): si se solapara con ella, quedaría debajo en
          el z-index y sus primeros 264px —justo el centro de un móvil— no recibirían el clic. */}
      {toggled && (
        <button
          type="button"
          aria-label="Cerrar menú"
          className="fixed inset-y-0 right-0 left-[264px] z-30 bg-black/40 lg:hidden"
          onClick={onClose}
        />
      )}

      <nav
        className={`hairline fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col border-r bg-[var(--color-surface)] transition-transform lg:static lg:translate-x-0 ${
          toggled ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <p className="flex items-center gap-2.5 px-5 py-5 text-[17px] font-semibold">
          <span className="badge-icon badge-icon-sm">
            <Sprout className="size-5" />
          </span>
          <span className="truncate">{organizationName}</span>
        </p>

        <div className="flex flex-col gap-1 px-2">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              onClick={onClose}
              className="sidebar-link"
            >
              <link.icon className="size-[18px]" />
              {link.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  )
}

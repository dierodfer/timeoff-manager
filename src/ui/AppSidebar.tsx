import { Sprout, type LucideProps } from 'lucide-react'
import type { ComponentType } from 'react'
import { NavLink } from 'react-router-dom'
import { Menu, MenuItem, Sidebar } from 'react-pro-sidebar'

// En un fichero propio para que react-pro-sidebar (y el emotion que arrastra) solo se
// descargue cuando hay un administrador: AppShell lo carga de forma perezosa, y un
// empleado normal nunca llega a pedirlo porque no ve barra lateral.

export interface NavItem {
  to: string
  label: string
  icon: ComponentType<LucideProps>
}

// Izado fuera del componente: no depende de props, y react-pro-sidebar reconduce así sus
// estilos de emotion a los tokens. No vale moverlo a CSS: los inyecta sin capa, y el CSS
// sin capa gana siempre al que está dentro de @layer components.
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

interface AppSidebarProps {
  readonly organizationName: string
  readonly links: NavItem[]
  readonly pathname: string
  readonly toggled: boolean
  readonly onClose: () => void
}

export function AppSidebar({
  organizationName,
  links,
  pathname,
  toggled,
  onClose,
}: AppSidebarProps) {
  return (
    <Sidebar
      breakPoint="lg"
      toggled={toggled}
      onBackdropClick={onClose}
      width="264px"
      backgroundColor="var(--color-surface)"
      rootStyles={{ borderColor: 'var(--color-hairline)' }}
    >
      <div className="flex min-h-dvh flex-col">
        <p className="flex items-center gap-2.5 px-5 py-5 text-[17px] font-semibold">
          <span className="badge-icon badge-icon-sm">
            <Sprout className="size-5" />
          </span>
          <span className="truncate">{organizationName}</span>
        </p>

        <Menu className="px-2" menuItemStyles={MENU_ITEM_STYLES}>
          {links.map((link) => (
            <MenuItem
              key={link.to}
              active={link.to === '/' ? pathname === '/' : pathname.startsWith(link.to)}
              icon={<link.icon className="size-[18px]" />}
              component={<NavLink to={link.to} end={link.to === '/'} />}
              onClick={onClose}
            >
              {link.label}
            </MenuItem>
          ))}
        </Menu>
      </div>
    </Sidebar>
  )
}

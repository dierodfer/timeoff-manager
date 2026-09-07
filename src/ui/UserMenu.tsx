import { LogOut } from 'lucide-react'
import { useCallback, useId, useRef, useState } from 'react'
import { displayName } from '../state/actions'
import { useSession } from '../state/appContext'
import { Avatar } from './Avatar'
import { useDismiss } from './useDismiss'

export function UserMenu() {
  const { currentUser, signOut } = useSession()
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const id = useId()

  const isInside = useCallback(
    (target: HTMLElement) => Boolean(container.current?.contains(target)),
    [],
  )
  useDismiss(open, isInside, () => setOpen(false))

  const role = currentUser.role === 'admin' ? 'Administrador' : 'Empleado'

  return (
    <div className="relative" ref={container}>
      <button
        type="button"
        className="icon-btn"
        aria-label="Tu cuenta"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <Avatar employee={currentUser} size="sm" />
      </button>

      {open && (
        <div id={id} role="menu" className="row-menu w-60">
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <Avatar employee={currentUser} size="md" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{displayName(currentUser)}</span>
              <span className="block truncate text-xs text-[var(--color-ink-muted)]">{role}</span>
            </span>
          </div>

          <button
            type="button"
            role="menuitem"
            className="row-menu-item hairline mt-1 flex items-center gap-2 border-t pt-2"
            onClick={signOut}
          >
            <LogOut className="size-4" />
            Salir
          </button>
        </div>
      )}
    </div>
  )
}

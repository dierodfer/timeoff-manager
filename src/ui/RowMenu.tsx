import { useEffect, useId, useRef, useState } from 'react'
import { MoreVertical } from 'lucide-react'

export interface RowMenuItem {
  label: string
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
  disabledReason?: string
}

interface RowMenuProps {
  readonly label: string
  readonly items: RowMenuItem[]
}

export function RowMenu({ label, items }: RowMenuProps) {
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (container.current?.contains(event.target as Node)) return
      setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // Escape consumido para que no burbujee hasta el Modal, que también cierra con Escape.
      event.preventDefault()
      setOpen(false)
    }

    document.addEventListener('click', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('click', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <div className="relative" ref={container}>
      <button
        type="button"
        className="icon-btn"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <MoreVertical className="size-5" />
      </button>

      {open && (
        <div id={id} role="menu" className="row-menu">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              title={item.disabled ? item.disabledReason : undefined}
              className={item.danger ? 'row-menu-item row-menu-item-danger' : 'row-menu-item'}
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

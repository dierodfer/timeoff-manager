import { useEffect, type ReactNode } from 'react'

interface ModalProps {
  readonly title: string
  readonly description?: string
  readonly onClose: () => void
  readonly children: ReactNode
  readonly footer?: ReactNode
  readonly wide?: boolean
}

export function Modal({ title, description, onClose, children, footer, wide }: ModalProps) {
  useEffect(() => {
    // defaultPrevented: un popover propio dentro del modal (p. ej. el calendario de
    // react-datepicker) también cierra con Escape y hace preventDefault() al suyo; sin este
    // chequeo, ese mismo Escape burbujea hasta aquí y cierra el modal entero por detrás.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-black/25 backdrop-blur-[2px]"
      />
      <div
        className={`card relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-b-none sm:rounded-b-[var(--radius-card)] ${
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'
        }`}
        style={{ boxShadow: 'var(--shadow-raised)' }}
      >
        <header className="hairline border-b px-6 py-4">
          <h2 className="text-lg">{title}</h2>
          {description && (
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{description}</p>
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer && (
          <footer className="hairline flex justify-end gap-2 border-t bg-[var(--color-surface-sunken)] px-6 py-4">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}

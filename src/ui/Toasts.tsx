import { useApp } from '../state/AppStore'

export function Toasts() {
  const { toasts, dismissToast } = useApp()
  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-60 flex flex-col items-center gap-2 px-4">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => dismissToast(toast.id)}
          className="card pointer-events-auto max-w-md px-4 py-3 text-left text-sm"
          style={{ boxShadow: 'var(--shadow-raised)' }}
        >
          <span
            className="mr-2 inline-block size-2 rounded-full align-middle"
            style={{
              background:
                toast.tone === 'error' ? 'var(--color-rejected)' : 'var(--color-approved)',
            }}
          />
          {toast.message}
        </button>
      ))}
    </div>
  )
}

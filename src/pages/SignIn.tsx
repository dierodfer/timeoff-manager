import { useState, type FormEvent } from 'react'
import { isActive } from '../domain/accrual'
import { todayIso } from '../domain/dates'
import type { Employee } from '../domain/types'
import { displayName, sortByName } from '../state/actions'
import { useApp } from '../state/appContext'

function initials(employee: Employee): string {
  return `${employee.firstName.at(0) ?? ''}${employee.lastName.at(0) ?? ''}`.toUpperCase()
}

export function SignIn() {
  const { database, signIn, notify } = useApp()
  const [selected, setSelected] = useState<Employee | null>(null)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)

  if (!database) return null

  const today = todayIso()
  const employees = sortByName(database.employees)

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!selected) return
    setBusy(true)
    try {
      if (!(await signIn(selected.id, pin))) {
        notify('PIN incorrecto.', 'error')
        setPin('')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <h1 className="text-2xl">{database.settings.organizationName}</h1>
      <p className="mt-1 text-[15px] text-[var(--color-ink-muted)]">
        {selected ? 'Introduce tu PIN para continuar.' : 'Elige tu perfil para continuar.'}
      </p>

      {!selected ? (
        <ul className="card mt-6 divide-y divide-[var(--color-hairline)] overflow-hidden">
          {employees.map((employee) => {
            const isInactive = !isActive(employee, today)
            return (
              <li key={employee.id}>
                <button
                  type="button"
                  onClick={() => setSelected(employee)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-[var(--color-surface-sunken)]"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-sm font-semibold text-[var(--color-accent)]">
                    {initials(employee)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">
                      {displayName(employee)}
                    </span>
                    <span className="block text-xs text-[var(--color-ink-muted)]">
                      {employee.role === 'admin' ? 'Administrador' : 'Empleado'}
                      {isInactive ? ' · baja' : ''}
                    </span>
                  </span>
                  <span className="text-[var(--color-ink-muted)]">›</span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <form onSubmit={(event) => void onSubmit(event)} className="card mt-6 space-y-4 p-6">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-sm font-semibold text-[var(--color-accent)]">
              {initials(selected)}
            </span>
            <p className="text-[15px] font-medium">{displayName(selected)}</p>
          </div>

          <div>
            <label className="label" htmlFor="pin">
              PIN
            </label>
            <input
              id="pin"
              className="field tabular text-center text-lg tracking-[0.3em]"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              value={pin}
              onChange={(event) => setPin(event.target.value)}
            />
            <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
              Si este perfil no tiene PIN, entra dejándolo en blanco.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-secondary flex-1"
              onClick={() => {
                setSelected(null)
                setPin('')
              }}
            >
              Cambiar
            </button>
            <button type="submit" className="btn btn-primary flex-1" disabled={busy}>
              Entrar
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

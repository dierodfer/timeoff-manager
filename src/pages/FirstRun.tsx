import { useState, type FormEvent } from 'react'
import { isValidPin, PIN_RULE } from '../data/pin'
import { useApp } from '../state/AppStore'

/**
 * Primer arranque en un dispositivo vacío: crea los ajustes, precarga los
 * festivos y da de alta al administrador.
 */
export function FirstRun() {
  const { bootstrap, notify } = useApp()
  const [organizationName, setOrganizationName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [pin, setPin] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!isValidPin(pin)) return notify(PIN_RULE, 'error')
    if (pin !== confirmation) return notify('Los dos PIN no coinciden.', 'error')

    setBusy(true)
    try {
      await bootstrap({
        organizationName: organizationName.trim() || 'Mi empresa',
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        pin,
        year: new Date().getFullYear(),
      })
      notify('Todo listo. Ya puedes dar de alta a tu equipo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-5 py-10">
      <h1 className="text-3xl">Vacaciones</h1>
      <p className="mt-2 text-[15px] text-[var(--color-ink-muted)]">
        Configura la aplicación en este dispositivo. Los datos se guardan en este navegador; desde
        Ajustes podrás exportarlos a un fichero para copiarlos o llevarlos a otro equipo.
      </p>

      <form onSubmit={onSubmit} className="card mt-6 space-y-4 p-6">
        <div>
          <label className="label" htmlFor="org">
            Nombre de la empresa
          </label>
          <input
            id="org"
            className="field"
            value={organizationName}
            onChange={(event) => setOrganizationName(event.target.value)}
            placeholder="Mi empresa"
            autoFocus
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="first">
              Tu nombre
            </label>
            <input
              id="first"
              className="field"
              required
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="last">
              Tus apellidos
            </label>
            <input
              id="last"
              className="field"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="pin">
              PIN de administrador
            </label>
            <input
              id="pin"
              className="field tabular"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              required
              value={pin}
              onChange={(event) => setPin(event.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="pin2">
              Repite el PIN
            </label>
            <input
              id="pin2"
              className="field tabular"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              required
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </div>
        </div>

        <p className="text-xs text-[var(--color-ink-muted)]">
          {PIN_RULE} Sirve para no cambiar de perfil por descuido; no cifra los datos ni protege el
          dispositivo.
        </p>

        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {busy ? 'Creando…' : 'Empezar'}
        </button>
      </form>
    </div>
  )
}

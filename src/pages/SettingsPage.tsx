import { Save } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { Settings } from '../domain/types'
import { WEEKDAY_NAMES } from '../domain/workdays'
import { useSession } from '../state/appContext'
import { Modal } from '../ui/Modal'
import { Section } from '../ui/Section'
import { Stepper } from '../ui/Stepper'

function settingsEqual(a: Settings, b: Settings): boolean {
  return (
    a.organizationName === b.organizationName &&
    a.defaultAnnualDays === b.defaultAnnualDays &&
    a.workweek.length === b.workweek.length &&
    a.workweek.every((day, index) => day === b.workweek[index])
  )
}

function Row({
  label,
  hint,
  control,
  stacked,
}: {
  readonly label: string
  readonly hint?: string
  readonly control: ReactNode
  readonly stacked?: boolean
}) {
  return (
    <div
      className={`gap-3 px-5 py-4 ${stacked ? '' : 'flex flex-wrap items-center justify-between'}`}
    >
      <div className={stacked ? 'mb-2' : 'min-w-0'}>
        <p className="text-[15px]">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">{hint}</p>}
      </div>
      {control}
    </div>
  )
}

export function SettingsPage() {
  const { database, commit, notify, wipe, mode } = useSession()
  const [confirmWipe, setConfirmWipe] = useState(false)
  const [draft, setDraft] = useState(database.settings)
  const dirty = !settingsEqual(draft, database.settings)

  const patchDraft = (changes: Partial<Settings>) => {
    setDraft((current) => ({ ...current, ...changes }))
  }

  const saveSettings = () => {
    const trimmed = { ...draft, organizationName: draft.organizationName.trim() }
    commit({ ...database, settings: trimmed })
    setDraft(trimmed)
    notify('Ajustes guardados.')
  }

  const toggleWorkday = (day: number) => {
    const workweek = draft.workweek.includes(day)
      ? draft.workweek.filter((item) => item !== day)
      : [...draft.workweek, day].sort((a, b) => a - b)
    if (workweek.length === 0) return notify('Tiene que quedar al menos un día laborable.', 'error')
    patchDraft({ workweek })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl">Ajustes</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Configuración general y datos guardados.
        </p>
      </div>

      <Section
        title="General"
        action={
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!dirty}
            onClick={saveSettings}
          >
            <Save className="size-4" />
            Guardar cambios
          </button>
        }
      >
        <Row
          label="Nombre de la empresa"
          control={
            <input
              className="field w-full sm:w-64"
              value={draft.organizationName}
              onChange={(event) => patchDraft({ organizationName: event.target.value })}
            />
          }
        />

        <Row
          label="Días de vacaciones al año"
          hint="Días para quien está de alta todo el año. Quien se da de alta a mitad de año recibe la parte proporcional."
          control={
            <Stepper
              label="tope anual"
              value={draft.defaultAnnualDays}
              min={1}
              max={366}
              onChange={(value) => patchDraft({ defaultAnnualDays: value })}
            />
          }
        />

        <Row
          stacked
          label="Jornada semanal"
          hint="Los días marcados descuentan saldo y son los que acumulan vacaciones."
          control={
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5, 6, 0].map((day) => {
                const active = draft.workweek.includes(day)
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleWorkday(day)}
                    className={`btn btn-sm capitalize ${active ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    {WEEKDAY_NAMES[day]}
                  </button>
                )
              })}
            </div>
          }
        />
      </Section>

      {mode === 'local' && (
        <Section
          title="Datos"
          description="Todo se guarda en este navegador y no sale de él. Es una demostración: si borras los datos de navegación o cambias de equipo, se empieza de cero."
        >
          <Row
            label="Empezar de cero"
            hint="Elimina empleados, solicitudes, festivos y ajustes de este navegador."
            control={
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => setConfirmWipe(true)}
              >
                Borrar todo
              </button>
            }
          />
        </Section>
      )}

      {confirmWipe && (
        <Modal
          title="Borrar todos los datos"
          description="Se eliminarán empleados, solicitudes, festivos y ajustes de este navegador."
          onClose={() => setConfirmWipe(false)}
          footer={
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setConfirmWipe(false)}
              >
                Cancelar
              </button>
              <button type="button" className="btn btn-danger" onClick={() => void wipe()}>
                Borrar definitivamente
              </button>
            </>
          }
        >
          <p className="text-sm text-[var(--color-ink-soft)]">
            Exporta una copia antes si quieres conservar el histórico. Esta acción no se puede
            deshacer.
          </p>
        </Modal>
      )}
    </div>
  )
}

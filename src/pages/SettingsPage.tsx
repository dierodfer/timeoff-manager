import { Save } from 'lucide-react'
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { newId } from '../data/ids'
import { yearOf, yearStart } from '../domain/dates'
import { formatDate } from '../domain/format'
import { hasPreloadedHolidays, preloadedHolidays, SCOPE_LABELS } from '../domain/holidays.es'
import type { Holiday, Settings } from '../domain/types'
import { WEEKDAY_NAMES } from '../domain/workdays'
import { useSession } from '../state/appContext'
import { Modal } from '../ui/Modal'
import { Stepper } from '../ui/Stepper'

function settingsEqual(a: Settings, b: Settings): boolean {
  return (
    a.organizationName === b.organizationName &&
    a.defaultAnnualDays === b.defaultAnnualDays &&
    a.workweek.length === b.workweek.length &&
    a.workweek.every((day, index) => day === b.workweek[index])
  )
}

function holidaysEqual(a: Holiday[], b: Holiday[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function Section({
  title,
  description,
  action,
  children,
}: {
  readonly title: string
  readonly description?: string
  readonly action?: ReactNode
  readonly children: ReactNode
}) {
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2 px-1">
        <div>
          <h2 className="text-[13px] font-semibold tracking-wide text-[var(--color-ink-muted)] uppercase">
            {title}
          </h2>
          {description && (
            <p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">{description}</p>
          )}
        </div>
        {action}
      </div>
      <div className="card divide-y divide-[var(--color-hairline)] overflow-hidden">{children}</div>
    </section>
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

// Se remonta con `key={year}`: sin eso la fecha propuesta se queda en el año
// en que se montó y el festivo acaba en un año que no se está viendo.
function AddHolidayForm({
  year,
  onAdd,
}: {
  readonly year: number
  readonly onAdd: (holiday: Holiday) => void
}) {
  const [date, setDate] = useState(() => yearStart(year))
  const [name, setName] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onAdd({ id: newId(), date, name: name.trim(), scope: 'algarrobo' })
    setName('')
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-end gap-3 bg-[var(--color-surface-sunken)] px-5 py-4"
    >
      <div>
        <label className="label" htmlFor="holiday-date">
          Fecha
        </label>
        <input
          id="holiday-date"
          type="date"
          className="field"
          required
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </div>
      <div className="min-w-40 flex-1">
        <label className="label" htmlFor="holiday-name">
          Nombre
        </label>
        <input
          id="holiday-name"
          className="field"
          required
          value={name}
          placeholder="Fiesta local"
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <button type="submit" className="btn btn-primary">
        Añadir festivo
      </button>
    </form>
  )
}

export function SettingsPage() {
  const { database, year, commit, notify, wipe, mode } = useSession()
  const [confirmWipe, setConfirmWipe] = useState(false)
  const [draft, setDraft] = useState(database.settings)
  const dirty = !settingsEqual(draft, database.settings)
  const [holidayDraft, setHolidayDraft] = useState(database.holidays)
  const holidayDirty = !holidaysEqual(holidayDraft, database.holidays)

  const holidays = useMemo(
    () =>
      holidayDraft
        .filter((holiday) => yearOf(holiday.date) === year)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [holidayDraft, year],
  )

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

  const addHoliday = (holiday: Holiday) => {
    if (!holiday.name) return notify('Ponle un nombre al festivo.', 'error')
    if (yearOf(holiday.date) !== year) {
      return notify(`Esa fecha no es de ${year}. Cambia de año arriba o corrige la fecha.`, 'error')
    }
    const clash = holidayDraft.find((item) => item.date === holiday.date)
    if (clash) return notify(`Ese día ya es festivo: ${clash.name}.`, 'error')

    setHolidayDraft((current) => [...current, holiday])
    notify(`${holiday.name} añadido el ${formatDate(holiday.date)}. Falta guardar los cambios.`)
  }

  const renameHoliday = (id: string, name: string) => {
    setHolidayDraft((current) =>
      current.map((holiday) => (holiday.id === id ? { ...holiday, name } : holiday)),
    )
  }

  const removeHoliday = (holiday: Holiday) => {
    setHolidayDraft((current) => current.filter((item) => item.id !== holiday.id))
    notify(`${holiday.name} eliminado. Falta guardar los cambios.`)
  }

  const loadOfficialHolidays = () => {
    const existing = new Set(holidayDraft.map((holiday) => holiday.date))
    // Los ids de preloadedHolidays() son fijos ("nacional-2026-01-01"), no uuid: valen para
    // IndexedDB pero Supabase los rechaza. Se sustituyen aquí, al cargarlos de verdad.
    const missing = preloadedHolidays(year)
      .filter((holiday) => !existing.has(holiday.date))
      .map((holiday) => ({ ...holiday, id: newId() }))
    if (missing.length === 0) {
      return notify(`Los ${holidays.length} festivos oficiales de ${year} ya están cargados.`)
    }
    setHolidayDraft((current) => [...current, ...missing])
    notify(`${missing.length} festivos oficiales añadidos a ${year}. Falta guardar los cambios.`)
  }

  const saveHolidays = () => {
    commit({ ...database, holidays: holidayDraft })
    notify('Festivos guardados.')
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl">Ajustes</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Configuración general, calendario de festivos y datos guardados.
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

      <Section
        title={`Festivos de ${year}`}
        description={`${holidays.length} en el calendario. Comunes para toda la plantilla; no computan como vacaciones.`}
        action={
          <div className="flex items-center gap-2">
            {hasPreloadedHolidays(year) && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={loadOfficialHolidays}
              >
                Cargar oficiales
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!holidayDirty}
              onClick={saveHolidays}
            >
              <Save className="size-4" />
              Guardar cambios
            </button>
          </div>
        }
      >
        <AddHolidayForm key={year} year={year} onAdd={addHoliday} />

        {holidays.length === 0 && (
          <p className="px-5 py-4 text-sm text-[var(--color-ink-muted)]">
            {hasPreloadedHolidays(year)
              ? `No hay festivos en ${year}. Pulsa «Cargar oficiales» para traer los del BOE y el BOJA.`
              : `No hay festivos precargados para ${year}: añádelos a mano según el calendario laboral que publiquen el BOE y el BOJA.`}
          </p>
        )}

        {holidays.map((holiday) => (
          <div key={holiday.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <span className="tabular w-44 shrink-0 text-sm text-[var(--color-ink-soft)]">
              {formatDate(holiday.date)}
            </span>
            <input
              className="field-inline min-w-40 flex-1"
              aria-label={`Nombre del festivo del ${holiday.date}`}
              defaultValue={holiday.name}
              onBlur={(event) => {
                const name = event.target.value.trim()
                if (name && name !== holiday.name) renameHoliday(holiday.id, name)
              }}
            />
            <span className="chip chip-neutral">{SCOPE_LABELS[holiday.scope]}</span>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => removeHoliday(holiday)}
            >
              Eliminar
            </button>
          </div>
        ))}
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

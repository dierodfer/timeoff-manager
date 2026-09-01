import { useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { BackupFormatError, downloadBackup, parseBackup } from '../data/backup'
import { newId } from '../data/ids'
import { yearOf, yearStart } from '../domain/dates'
import { hasPreloadedHolidays, preloadedHolidays, SCOPE_LABELS } from '../domain/holidays.es'
import type { Holiday } from '../domain/types'
import { WEEKDAY_NAMES } from '../domain/workdays'
import { useSession } from '../state/appContext'
import { Modal } from '../ui/Modal'
import { Stepper } from '../ui/Stepper'
import { formatLongDate } from '../ui/calendarGrid'

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
    onAdd({ id: newId('hol'), date, name: name.trim(), scope: 'algarrobo' })
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
  const { database, year, commit, notify, replaceDatabase, wipe } = useSession()
  const fileInput = useRef<HTMLInputElement>(null)
  const [confirmWipe, setConfirmWipe] = useState(false)

  const holidays = useMemo(
    () =>
      database.holidays
        .filter((holiday) => yearOf(holiday.date) === year)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [database.holidays, year],
  )

  const updateSettings = (changes: Partial<typeof database.settings>) => {
    commit({ ...database, settings: { ...database.settings, ...changes } })
  }

  const toggleWorkday = (day: number) => {
    const workweek = database.settings.workweek.includes(day)
      ? database.settings.workweek.filter((item) => item !== day)
      : [...database.settings.workweek, day].sort((a, b) => a - b)
    if (workweek.length === 0) return notify('Tiene que quedar al menos un día laborable.', 'error')
    updateSettings({ workweek })
  }

  const addHoliday = (holiday: Holiday) => {
    if (!holiday.name) return notify('Ponle un nombre al festivo.', 'error')
    if (yearOf(holiday.date) !== year) {
      return notify(`Esa fecha no es de ${year}. Cambia de año arriba o corrige la fecha.`, 'error')
    }
    const clash = database.holidays.find((item) => item.date === holiday.date)
    if (clash) return notify(`Ese día ya es festivo: ${clash.name}.`, 'error')

    commit({ ...database, holidays: [...database.holidays, holiday] })
    notify(`${holiday.name} añadido el ${formatLongDate(holiday.date)}.`)
  }

  const renameHoliday = (id: string, name: string) => {
    commit({
      ...database,
      holidays: database.holidays.map((holiday) =>
        holiday.id === id ? { ...holiday, name } : holiday,
      ),
    })
  }

  const removeHoliday = (holiday: Holiday) => {
    commit({
      ...database,
      holidays: database.holidays.filter((item) => item.id !== holiday.id),
    })
    notify(`${holiday.name} eliminado.`)
  }

  const loadOfficialHolidays = () => {
    const existing = new Set(database.holidays.map((holiday) => holiday.date))
    const missing = preloadedHolidays(year).filter((holiday) => !existing.has(holiday.date))
    if (missing.length === 0) {
      return notify(`Los ${holidays.length} festivos oficiales de ${year} ya están cargados.`)
    }
    commit({ ...database, holidays: [...database.holidays, ...missing] })
    notify(`${missing.length} festivos oficiales añadidos a ${year}.`)
  }

  const importBackup = async (file: File) => {
    try {
      const imported = parseBackup(await file.text())
      replaceDatabase(imported)
      notify('Copia importada. Vuelve a identificarte.')
    } catch (error) {
      notify(
        error instanceof BackupFormatError ? error.message : 'No se ha podido leer el fichero.',
        'error',
      )
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl">Ajustes</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Configuración general, calendario de festivos y copias de seguridad.
        </p>
      </div>

      <Section title="General">
        <Row
          label="Nombre de la empresa"
          control={
            <input
              className="field w-full sm:w-64"
              defaultValue={database.settings.organizationName}
              onBlur={(event) => updateSettings({ organizationName: event.target.value.trim() })}
            />
          }
        />

        <Row
          label="Días de vacaciones al año"
          hint="Tope anual. La estimación acumula 0,0737 días por día trabajado y nunca lo supera."
          control={
            <Stepper
              label="tope anual"
              value={database.settings.defaultAnnualDays}
              min={1}
              max={366}
              onChange={(value) => updateSettings({ defaultAnnualDays: value })}
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
                const active = database.settings.workweek.includes(day)
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
          hasPreloadedHolidays(year) && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={loadOfficialHolidays}
            >
              Cargar oficiales
            </button>
          )
        }
      >
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
              {formatLongDate(holiday.date)}
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

        <AddHolidayForm key={year} year={year} onAdd={addHoliday} />
      </Section>

      <Section
        title="Datos"
        description="Todo se guarda en este navegador. Exporta una copia para no perderla al borrar los datos de navegación o al cambiar de equipo."
      >
        <Row
          label="Copia de seguridad"
          hint="Un fichero JSON con empleados, solicitudes, festivos y ajustes."
          control={
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  downloadBackup(database)
                  notify('Copia descargada.')
                }}
              >
                Exportar copia
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => fileInput.current?.click()}
              >
                Importar copia
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void importBackup(file)
                  event.target.value = ''
                }}
              />
            </div>
          }
        />

        <Row
          label="Borrar todo"
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

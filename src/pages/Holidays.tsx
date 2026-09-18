import { Save } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { newId } from '../data/ids'
import { yearOf, yearStart } from '../domain/dates'
import { formatDate } from '../domain/format'
import { hasPreloadedHolidays, preloadedHolidays, SCOPE_LABELS } from '../domain/holidays.es'
import type { Holiday } from '../domain/types'
import { useSession } from '../state/appContext'
import { Section } from '../ui/Section'

function holidaysEqual(a: Holiday[], b: Holiday[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
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

export function Holidays() {
  const { database, year, commit, notify } = useSession()
  const [holidayDraft, setHolidayDraft] = useState(database.holidays)
  const holidayDirty = !holidaysEqual(holidayDraft, database.holidays)

  const holidays = useMemo(
    () =>
      holidayDraft
        .filter((holiday) => yearOf(holiday.date) === year)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [holidayDraft, year],
  )

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl">Festivos de {year}</h1>
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
      </div>

      <Section>
        <AddHolidayForm key={year} year={year} onAdd={addHoliday} />

        <p className="px-5 py-3 text-sm text-[var(--color-ink-muted)]">
          {holidays.length} {holidays.length === 1 ? 'festivo' : 'festivos'} en {year}
        </p>

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
    </div>
  )
}

import { useMemo, useRef, useState } from 'react'
import { BackupFormatError, downloadBackup, parseBackup } from '../data/backup'
import { newId } from '../data/ids'
import { hasPreloadedHolidays, preloadedHolidays, SCOPE_LABELS } from '../domain/holidays.es'
import { yearOf } from '../domain/dates'
import type { Holiday, HolidayScope } from '../domain/types'
import { WEEKDAY_NAMES } from '../domain/workdays'
import { useSession } from '../state/AppStore'
import { Modal } from '../ui/Modal'
import { Stepper } from '../ui/Stepper'
import { formatLongDate } from '../ui/calendarGrid'

export function SettingsPage() {
  const { database, year, commit, notify, replaceDatabase, wipe } = useSession()
  const fileInput = useRef<HTMLInputElement>(null)
  const [confirmWipe, setConfirmWipe] = useState(false)
  const [newHoliday, setNewHoliday] = useState({ date: `${year}-01-01`, name: '' })

  const holidays = useMemo(
    () =>
      database.holidays
        .filter((holiday) => yearOf(holiday.date) === year)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [database.holidays, year],
  )

  const updateSettings = async (changes: Partial<typeof database.settings>) => {
    await commit({ ...database, settings: { ...database.settings, ...changes } })
  }

  const toggleWorkday = async (day: number) => {
    const workweek = database.settings.workweek.includes(day)
      ? database.settings.workweek.filter((item) => item !== day)
      : [...database.settings.workweek, day].sort()
    if (workweek.length === 0) return notify('Tiene que quedar al menos un día laborable.', 'error')
    await updateSettings({ workweek })
  }

  const addHoliday = async () => {
    if (!newHoliday.name.trim()) return notify('Ponle un nombre al festivo.', 'error')
    if (database.holidays.some((holiday) => holiday.date === newHoliday.date)) {
      return notify('Ya hay un festivo en esa fecha.', 'error')
    }
    const holiday: Holiday = {
      id: newId('hol'),
      date: newHoliday.date,
      name: newHoliday.name.trim(),
      scope: 'algarrobo',
    }
    await commit({ ...database, holidays: [...database.holidays, holiday] })
    setNewHoliday({ date: `${year}-01-01`, name: '' })
    notify('Festivo añadido.')
  }

  const renameHoliday = async (id: string, name: string) => {
    await commit({
      ...database,
      holidays: database.holidays.map((holiday) =>
        holiday.id === id ? { ...holiday, name } : holiday,
      ),
    })
  }

  const removeHoliday = async (id: string) => {
    await commit({
      ...database,
      holidays: database.holidays.filter((holiday) => holiday.id !== id),
    })
    notify('Festivo eliminado.')
  }

  const loadOfficialHolidays = async () => {
    const existing = new Set(database.holidays.map((holiday) => holiday.date))
    const missing = preloadedHolidays(year).filter((holiday) => !existing.has(holiday.date))
    if (missing.length === 0) return notify('Ya están todos los festivos oficiales de ese año.')
    await commit({ ...database, holidays: [...database.holidays, ...missing] })
    notify(`${missing.length} festivos añadidos.`)
  }

  const importBackup = async (file: File) => {
    try {
      const imported = parseBackup(await file.text())
      await replaceDatabase(imported)
      notify('Copia importada. Vuelve a identificarte.')
    } catch (error) {
      notify(
        error instanceof BackupFormatError ? error.message : 'No se ha podido leer el fichero.',
        'error',
      )
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">Ajustes</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Configuración general, calendario de festivos y copias de seguridad.
        </p>
      </div>

      <section className="card space-y-5 p-5">
        <h2 className="text-sm font-semibold">General</h2>

        <div>
          <label className="label" htmlFor="org-name">
            Nombre de la empresa
          </label>
          <input
            id="org-name"
            className="field max-w-sm"
            defaultValue={database.settings.organizationName}
            onBlur={(event) => updateSettings({ organizationName: event.target.value.trim() })}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Días de vacaciones al año</p>
            <p className="text-xs text-[var(--color-ink-muted)]">
              Base para la estimación automática, que después se prorratea según el periodo
              trabajado.
            </p>
          </div>
          <Stepper
            label="base anual"
            value={database.settings.defaultAnnualDays}
            min={1}
            max={366}
            onChange={(value) => updateSettings({ defaultAnnualDays: value })}
          />
        </div>

        <div>
          <p className="text-sm font-medium">Jornada semanal</p>
          <p className="mb-2 text-xs text-[var(--color-ink-muted)]">
            Los días marcados son los que descuentan saldo al pedir vacaciones.
          </p>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5, 6, 0].map((day) => {
              const active = database.settings.workweek.includes(day)
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleWorkday(day)}
                  className={`btn btn-sm ${active ? 'btn-primary' : 'btn-secondary'} capitalize`}
                >
                  {WEEKDAY_NAMES[day]}
                </button>
              )
            })}
          </div>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="hairline flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Festivos de {year}</h2>
            <p className="text-xs text-[var(--color-ink-muted)]">
              Comunes para toda la plantilla. No computan como vacaciones.
            </p>
          </div>
          {hasPreloadedHolidays(year) && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={loadOfficialHolidays}>
              Cargar festivos oficiales
            </button>
          )}
        </div>

        {!hasPreloadedHolidays(year) && holidays.length === 0 && (
          <p className="hairline border-b px-5 py-3 text-sm text-[var(--color-ink-muted)]">
            No hay festivos precargados para {year}: añádelos a mano según el calendario laboral que
            publiquen el BOE y el BOJA.
          </p>
        )}

        <ul className="divide-y divide-[var(--color-hairline)]">
          {holidays.map((holiday) => (
            <li key={holiday.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <span className="tabular w-44 text-sm text-[var(--color-ink-soft)]">
                {formatLongDate(holiday.date)}
              </span>
              <input
                className="field min-w-40 flex-1"
                defaultValue={holiday.name}
                onBlur={(event) => {
                  const name = event.target.value.trim()
                  if (name && name !== holiday.name) renameHoliday(holiday.id, name)
                }}
              />
              <span className="chip chip-neutral">{SCOPE_LABELS[holiday.scope as HolidayScope]}</span>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => removeHoliday(holiday.id)}
              >
                Eliminar
              </button>
            </li>
          ))}
        </ul>

        <div className="hairline flex flex-wrap items-end gap-3 border-t bg-[var(--color-surface-sunken)] px-5 py-4">
          <div>
            <label className="label" htmlFor="holiday-date">
              Fecha
            </label>
            <input
              id="holiday-date"
              type="date"
              className="field"
              value={newHoliday.date}
              onChange={(event) => setNewHoliday((current) => ({ ...current, date: event.target.value }))}
            />
          </div>
          <div className="min-w-40 flex-1">
            <label className="label" htmlFor="holiday-name">
              Nombre
            </label>
            <input
              id="holiday-name"
              className="field"
              value={newHoliday.name}
              onChange={(event) => setNewHoliday((current) => ({ ...current, name: event.target.value }))}
              placeholder="Fiesta local"
            />
          </div>
          <button type="button" className="btn btn-primary" onClick={addHoliday}>
            Añadir festivo
          </button>
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <div>
          <h2 className="text-sm font-semibold">Datos</h2>
          <p className="text-xs text-[var(--color-ink-muted)]">
            Todo se guarda en este navegador. Exporta una copia para no perderla al borrar los datos
            de navegación o al cambiar de equipo.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              downloadBackup(database)
              notify('Copia descargada.')
            }}
          >
            Exportar copia
          </button>

          <button
            type="button"
            className="btn btn-secondary"
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
              if (file) importBackup(file)
              event.target.value = ''
            }}
          />

          <button type="button" className="btn btn-danger" onClick={() => setConfirmWipe(true)}>
            Borrar todo
          </button>
        </div>

        <p className="text-xs text-[var(--color-ink-muted)]">
          Al importar se reemplazan todos los datos actuales de este dispositivo.
        </p>
      </section>

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
              <button type="button" className="btn btn-danger" onClick={() => wipe()}>
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

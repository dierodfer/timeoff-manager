import { useCallback, useMemo, useState } from 'react'
import { isActiveInYear } from '../domain/accrual'
import { computeBalance } from '../domain/balance'
import { formatDays } from '../domain/format'
import { compareIso, todayIso } from '../domain/dates'
import type { Employee, IsoDate } from '../domain/types'
import { isWorkingDay } from '../domain/workdays'
import { createVacation, displayName, sortByName } from '../state/actions'
import { useSession } from '../state/appContext'
import { Modal } from '../ui/Modal'
import { GRID_DAY_CLASS, summarizeDays, type DayState } from '../ui/calendarGrid'
import type { DayMark } from '../ui/MonthCalendar'
import { useDaySelection } from '../ui/useDaySelection'
import { YearGrid } from '../ui/YearGrid'

export function Planning() {
  const { database, currentUser, year, calendar, apply, notify } = useSession()
  const [employeeId, setEmployeeId] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)

  const canSelect = useCallback((date: IsoDate) => isWorkingDay(calendar, date), [calendar])
  const { selected, toggle, clear } = useDaySelection(canSelect)

  const employees = useMemo(
    () => sortByName(database.employees.filter((employee) => isActiveInYear(employee, year))),
    [database.employees, year],
  )

  const marks = useMemo(() => {
    const map = new Map<string, DayMark>()
    for (const request of database.requests) {
      if (request.year !== year || request.status === 'rechazada') continue
      for (const day of request.days) map.set(`${request.employeeId}|${day}`, request.status)
    }
    return map
  }, [database.requests, year])

  const target: Employee | undefined = employees.find((employee) => employee.id === employeeId)
  const selectedDays = useMemo(() => [...selected].sort(compareIso), [selected])

  const balance = useMemo(
    () =>
      target
        ? computeBalance(target, year, database.settings, database.allowances, database.requests)
        : null,
    [target, year, database],
  )

  const handleToggle = (nextEmployeeId: string, date: IsoDate, extendRange: boolean) => {
    if (nextEmployeeId !== employeeId) {
      clear()
      setEmployeeId(nextEmployeeId)
      toggle(date, false)
      return
    }
    toggle(date, extendRange)
  }

  const submit = () => {
    if (!target) return
    const ok = apply((db) =>
      createVacation(db, {
        employeeId: target.id,
        days: selectedDays,
        status: 'aprobada',
        authorId: currentUser.id,
        comment,
      }),
    )
    if (ok) {
      notify(`Vacaciones aprobadas para ${displayName(target)}.`)
      clear()
      setEmployeeId(null)
      setComment('')
      setDialogOpen(false)
    }
  }

  return (
    <div className="space-y-5 pb-24">
      <div>
        <h1 className="text-2xl">Planificación {year}</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Una fila por empleado y una columna por día. Pulsa las celdas de una fila para generar
          vacaciones ya aprobadas; con mayúsculas seleccionas el rango completo.
        </p>
      </div>

      <Legend />

      {employees.length === 0 ? (
        <p className="card p-6 text-sm text-[var(--color-ink-muted)]">
          No hay ningún empleado con relación laboral en {year}.
        </p>
      ) : (
        <YearGrid
          year={year}
          employees={employees}
          calendar={calendar}
          markOf={(id, date) => marks.get(`${id}|${date}`)}
          selectedEmployeeId={employeeId}
          selected={selected}
          today={todayIso()}
          onToggle={handleToggle}
        />
      )}

      {target && selectedDays.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 p-4">
          <div
            className="card glass mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3 px-4 py-3"
            style={{ boxShadow: 'var(--shadow-raised)' }}
          >
            <p className="min-w-0 text-sm">
              <span className="font-semibold">{displayName(target)}</span>{' '}
              <span className="text-[var(--color-ink-muted)]">
                · {selectedDays.length} {selectedDays.length === 1 ? 'día' : 'días'} ·{' '}
                {formatDays(balance?.available ?? 0)} disponibles
              </span>
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  clear()
                  setEmployeeId(null)
                }}
              >
                Limpiar
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setDialogOpen(true)}
              >
                Aprobar vacaciones
              </button>
            </div>
          </div>
        </div>
      )}

      {dialogOpen && target && (
        <Modal
          title={`Vacaciones de ${displayName(target)}`}
          description={`${selectedDays.length} ${selectedDays.length === 1 ? 'día laborable' : 'días laborables'}: ${summarizeDays(selectedDays)}`}
          onClose={() => setDialogOpen(false)}
          footer={
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDialogOpen(false)}
              >
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={submit}>
                Crear como aprobadas
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="label" htmlFor="planning-comment">
                Comentario (opcional)
              </label>
              <textarea
                id="planning-comment"
                className="field"
                rows={3}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
              />
            </div>
            {balance && (
              <p className="text-xs text-[var(--color-ink-muted)]">
                {displayName(target)} tiene {formatDays(balance.assigned)} días asignados en {year}{' '}
                y {formatDays(balance.available)} disponibles.
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}

function Legend() {
  const items: { label: string; state: DayState }[] = [
    { label: 'Aprobadas', state: 'aprobada' },
    { label: 'Pendientes', state: 'pendiente' },
    { label: 'Festivo', state: 'festivo' },
    { label: 'No laborable', state: 'no-laborable' },
    { label: 'Selección', state: 'selected' },
  ]

  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-[var(--color-ink-muted)]">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            className={`${GRID_DAY_CLASS[item.state]} hairline inline-block size-3 rounded-[4px] border`}
          />
          {item.label}
        </li>
      ))}
    </ul>
  )
}

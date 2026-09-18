import { useCallback, useMemo, useRef, useState } from 'react'
import { isActiveInYear } from '../domain/accrual'
import { computeBalance } from '../domain/balance'
import { compareIso, expandRange, todayIso } from '../domain/dates'
import { formatDays } from '../domain/format'
import type { Employee, IsoDate } from '../domain/types'
import { isWorkingDay } from '../domain/workdays'
import { approveMany, displayName, sortByName, type BulkApproveResult } from '../state/actions'
import { useSession } from '../state/appContext'
import { Modal } from '../ui/Modal'
import { GRID_DAY_CLASS, summarizeDays, type DayState } from '../ui/calendarGrid'
import type { DayMark } from '../ui/MonthCalendar'
import { YearGrid } from '../ui/YearGrid'

interface Entry {
  employee: Employee
  days: IsoDate[]
}

export function Planning() {
  const { database, currentUser, year, calendar, commit, notify } = useSession()
  const [selection, setSelection] = useState<ReadonlyMap<string, ReadonlySet<IsoDate>>>(
    () => new Map(),
  )
  const [comment, setComment] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [result, setResult] = useState<BulkApproveResult | null>(null)
  const anchors = useRef<Map<string, IsoDate>>(new Map())

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

  // Mismas condiciones que canSelect() en Mi calendario: ni festivos/domingos ni un día que ya
  // tenga una solicitud aprobada o pendiente para esa persona.
  const canSelect = useCallback(
    (employeeId: string, date: IsoDate) =>
      isWorkingDay(calendar, date) && !marks.get(`${employeeId}|${date}`),
    [calendar, marks],
  )

  // Un ancla por empleado, no una sola: mayúsculas en la fila de una persona no debe extender
  // el rango a partir del último clic en la fila de otra.
  const toggle = useCallback(
    (employeeId: string, date: IsoDate, extendRange: boolean) => {
      if (!canSelect(employeeId, date)) return
      const from = extendRange ? (anchors.current.get(employeeId) ?? null) : null
      anchors.current.set(employeeId, date)

      setSelection((current) => {
        const currentSet = current.get(employeeId) ?? new Set<IsoDate>()
        const additions =
          extendRange && from
            ? expandRange(from, date).filter(
                (day) => canSelect(employeeId, day) && !currentSet.has(day),
              )
            : currentSet.has(date)
              ? []
              : [date]

        const nextSet = new Set(currentSet)
        if (extendRange && from) {
          for (const day of additions) nextSet.add(day)
        } else if (nextSet.has(date)) {
          nextSet.delete(date)
        } else {
          nextSet.add(date)
        }

        const next = new Map(current)
        if (nextSet.size === 0) next.delete(employeeId)
        else next.set(employeeId, nextSet)
        return next
      })
    },
    [canSelect],
  )

  const clearAll = () => {
    setSelection(new Map())
    anchors.current.clear()
  }

  const entries: Entry[] = useMemo(
    () =>
      [...selection.entries()]
        .flatMap(([employeeId, days]) => {
          const employee = employees.find((item) => item.id === employeeId)
          return employee ? [{ employee, days: [...days].sort(compareIso) }] : []
        })
        .sort((a, b) => displayName(a.employee).localeCompare(displayName(b.employee), 'es')),
    [selection, employees],
  )

  const totalDays = entries.reduce((total, entry) => total + entry.days.length, 0)

  const balanceFor = useCallback(
    (employee: Employee) =>
      computeBalance(employee, year, database.settings, database.allowances, database.requests),
    [year, database],
  )

  const hasShortfall = entries.some(
    (entry) => entry.days.length > balanceFor(entry.employee).available + 1e-9,
  )

  const submit = () => {
    const outcome = approveMany(
      database,
      entries.map((entry) => ({ employeeId: entry.employee.id, days: entry.days })),
      currentUser.id,
      comment,
    )

    if (outcome.assigned.length > 0) {
      commit(outcome.database)
      notify(
        `Vacaciones aprobadas para ${outcome.assigned.length} ${
          outcome.assigned.length === 1 ? 'persona' : 'personas'
        }.`,
      )
      clearAll()
      setComment('')
      setDialogOpen(false)
    } else {
      notify('No se ha podido aprobar ninguna solicitud.', 'error')
    }

    setResult(outcome)
  }

  return (
    <div className="space-y-5 pb-24">
      <div>
        <h1 className="text-2xl">Planificación {year}</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Una fila por empleado y una columna por día. Pulsa las celdas para marcar días de varias
          personas a la vez —con mayúsculas seleccionas el rango completo de una fila— y revisa el
          resumen antes de aprobarlos.
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
          isSelected={(id, date) => selection.get(id)?.has(date) ?? false}
          hasSelection={(id) => (selection.get(id)?.size ?? 0) > 0}
          today={todayIso()}
          onToggle={toggle}
        />
      )}

      {result && (
        <div className="card space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Resultado de la última aprobación</h2>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setResult(null)}>
              Ocultar
            </button>
          </div>

          {result.assigned.length > 0 && (
            <div>
              <p className="text-xs font-medium text-[var(--color-approved)]">Aprobadas</p>
              <ul className="mt-1 space-y-0.5 text-sm text-[var(--color-ink-soft)]">
                {result.assigned.map((item) => (
                  <li key={item.employeeId}>
                    {item.name} · {item.days} {item.days === 1 ? 'día' : 'días'}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.skipped.length > 0 && (
            <div>
              <p className="text-xs font-medium text-[var(--color-rejected)]">Sin aprobar</p>
              <ul className="mt-1 space-y-0.5 text-sm text-[var(--color-ink-soft)]">
                {result.skipped.map((item) => (
                  <li key={item.employeeId}>
                    {item.name} · {item.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {entries.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 p-4">
          <div
            className="card glass mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3 px-4 py-3"
            style={{ boxShadow: 'var(--shadow-raised)' }}
          >
            <p className="min-w-0 text-sm">
              <span className="font-semibold">
                {entries.length} {entries.length === 1 ? 'persona' : 'personas'}
              </span>{' '}
              <span className="text-[var(--color-ink-muted)]">
                · {totalDays} {totalDays === 1 ? 'día' : 'días'} en total
              </span>
            </p>
            <div className="flex gap-2">
              <button type="button" className="btn btn-secondary btn-sm" onClick={clearAll}>
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

      {dialogOpen && (
        <Modal
          title="Revisar antes de aprobar"
          description={`${entries.length} ${entries.length === 1 ? 'persona' : 'personas'} · ${totalDays} ${
            totalDays === 1 ? 'día' : 'días'
          } en total`}
          onClose={() => setDialogOpen(false)}
          wide
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
                Confirmar aprobación
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <ul className="hairline divide-y divide-[var(--color-hairline)] rounded-[var(--radius-control)] border">
              {entries.map((entry) => {
                const balance = balanceFor(entry.employee)
                const short = entry.days.length > balance.available + 1e-9
                return (
                  <li
                    key={entry.employee.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{displayName(entry.employee)}</p>
                      <p className="text-xs text-[var(--color-ink-muted)]">
                        {entry.days.length} {entry.days.length === 1 ? 'día' : 'días'}:{' '}
                        {summarizeDays(entry.days)}
                      </p>
                    </div>
                    {short ? (
                      <span className="chip chip-rechazada">Saldo insuficiente</span>
                    ) : (
                      <span className="text-xs text-[var(--color-ink-muted)]">
                        {formatDays(balance.available)} disponibles
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>

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

            {hasShortfall && (
              <p className="text-xs text-[var(--color-rejected)]">
                Quien no tenga saldo suficiente se quedará sin aprobar; el resto sí se creará.
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

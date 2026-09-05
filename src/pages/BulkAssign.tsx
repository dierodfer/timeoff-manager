import { useMemo, useState } from 'react'
import { isActiveInYear } from '../domain/accrual'
import { withBalances } from '../domain/balance'
import { formatDate, formatDays } from '../domain/format'
import { workingDaysInRange } from '../domain/workdays'
import { bulkAssign, displayName, sortByName, type BulkAssignResult } from '../state/actions'
import { useSession } from '../state/appContext'
import { DateRangePicker, type DateRange } from '../ui/DateRangePicker'

export function BulkAssign() {
  const { database, currentUser, year, calendar, commit, notify } = useSession()
  const [range, setRange] = useState<DateRange>({ start: null, end: null })
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set())
  const [comment, setComment] = useState('')
  const [result, setResult] = useState<BulkAssignResult | null>(null)

  const employees = useMemo(
    () => sortByName(database.employees.filter((employee) => isActiveInYear(employee, year))),
    [database.employees, year],
  )

  const rows = useMemo(
    () => withBalances(employees, year, database.settings, database.allowances, database.requests),
    [employees, year, database.settings, database.allowances, database.requests],
  )

  const days = useMemo(() => {
    if (!range.start || !range.end) return []
    return workingDaysInRange(calendar, range.start, range.end)
  }, [calendar, range])

  const toggleEmployee = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const assign = () => {
    const outcome = bulkAssign(database, {
      employeeIds: [...selectedIds],
      days,
      authorId: currentUser.id,
      comment,
    })

    if (outcome.assigned.length > 0) {
      commit(outcome.database)
      notify(
        `Vacaciones asignadas a ${outcome.assigned.length} ${
          outcome.assigned.length === 1 ? 'empleado' : 'empleados'
        }.`,
      )
      setSelectedIds(new Set())
      setComment('')
      setRange({ start: null, end: null })
    } else {
      notify('No se ha podido asignar a ningún empleado.', 'error')
    }

    setResult(outcome)
  }

  const canAssign = days.length > 0 && selectedIds.size > 0

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl">Asignación masiva</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Asigna el mismo periodo a varios empleados como vacaciones ya aprobadas. Los días computan
          en el límite individual de cada uno, así que quien no tenga saldo se queda fuera.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="card space-y-4 p-5">
          <div>
            <span className="label">Periodo</span>
            <DateRangePicker year={year} calendar={calendar} value={range} onChange={setRange} />
          </div>

          <div className="hairline rounded-[var(--radius-control)] border bg-[var(--color-surface-sunken)] p-3 text-sm">
            {range.start && range.end ? (
              <>
                <p className="font-medium">
                  {days.length} {days.length === 1 ? 'día laborable' : 'días laborables'}
                </p>
                <p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">
                  {formatDate(range.start)} – {formatDate(range.end)}
                </p>
              </>
            ) : (
              <p className="text-xs text-[var(--color-ink-muted)]">
                {range.start
                  ? 'Elige el día en el que termina el periodo.'
                  : 'Elige el día en el que empieza el periodo.'}
              </p>
            )}
          </div>

          <div>
            <label className="label" htmlFor="bulk-comment">
              Comentario (opcional)
            </label>
            <textarea
              id="bulk-comment"
              className="field"
              rows={3}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Cierre por vacaciones, puente de empresa…"
            />
          </div>

          <button
            type="button"
            className="btn btn-primary w-full"
            disabled={!canAssign}
            onClick={assign}
          >
            Asignar a {selectedIds.size} {selectedIds.size === 1 ? 'empleado' : 'empleados'}
          </button>
        </div>

        <div className="card overflow-hidden">
          <div className="hairline flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Empleados</h2>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                onClick={() => setSelectedIds(new Set(employees.map((employee) => employee.id)))}
              >
                Todos
              </button>
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                onClick={() => setSelectedIds(new Set())}
              >
                Ninguno
              </button>
            </div>
          </div>

          <ul className="divide-y divide-[var(--color-hairline)]">
            {rows.map(({ employee, balance }) => {
              const short = days.length > balance.available + 1e-9
              return (
                <li key={employee.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-4 py-3 transition hover:bg-[var(--color-surface-sunken)]">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(employee.id)}
                      onChange={() => toggleEmployee(employee.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {displayName(employee)}
                      </span>
                      <span className="block text-xs text-[var(--color-ink-muted)]">
                        {formatDays(balance.available)} de {formatDays(balance.assigned)} días
                        disponibles
                      </span>
                    </span>
                    {short && days.length > 0 && (
                      <span className="chip chip-rechazada">Saldo insuficiente</span>
                    )}
                  </label>
                </li>
              )
            })}

            {employees.length === 0 && (
              <li className="p-6 text-sm text-[var(--color-ink-muted)]">
                No hay empleados con relación laboral en {year}.
              </li>
            )}
          </ul>
        </div>
      </div>

      {result && (
        <div className="card space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Resultado de la última asignación</h2>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setResult(null)}>
              Ocultar
            </button>
          </div>

          {result.assigned.length > 0 && (
            <div>
              <p className="text-xs font-medium text-[var(--color-approved)]">Asignadas</p>
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
              <p className="text-xs font-medium text-[var(--color-rejected)]">Sin asignar</p>
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
    </div>
  )
}

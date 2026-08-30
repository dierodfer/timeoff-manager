import { useCallback, useMemo, useState } from 'react'
import { employmentSpanInYear } from '../domain/accrual'
import { computeBalance, requestsOf } from '../domain/balance'
import { formatDays, pluralDays } from '../domain/format'
import { todayIso } from '../domain/dates'
import type { Employee, IsoDate } from '../domain/types'
import { isWorkingDay } from '../domain/workdays'
import { createVacation, displayName, removeRequest, sortByName } from '../state/actions'
import { useSession } from '../state/appContext'
import { BalanceCard } from '../ui/BalanceCard'
import { Modal } from '../ui/Modal'
import { RequestCard } from '../ui/RequestCard'
import { summarizeDays } from '../ui/calendarGrid'
import type { DayMark } from '../ui/MonthCalendar'
import { useDaySelection } from '../ui/useDaySelection'
import { YearCalendar } from '../ui/YearCalendar'

export function MyCalendar() {
  const { database, currentUser, year, calendar, apply, notify } = useSession()
  const isAdmin = currentUser.role === 'admin'

  const viewableEmployees = useMemo(
    () => sortByName(database.employees.filter((employee) => employmentSpanInYear(employee, year))),
    [database.employees, year],
  )

  const [viewedEmployeeId, setViewedEmployeeId] = useState(currentUser.id)
  const [comment, setComment] = useState('')
  const [asApproved, setAsApproved] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  const canSelect = useCallback((date: IsoDate) => isWorkingDay(calendar, date), [calendar])
  const { selected, toggle, clear } = useDaySelection(canSelect)

  // Derivado, no estado: sincronizarlo con un efecto provoca renders en cascada.
  const viewedEmployee: Employee =
    (isAdmin && viewableEmployees.find((employee) => employee.id === viewedEmployeeId)) ||
    currentUser
  const viewingSelf = viewedEmployee.id === currentUser.id

  const switchTo = (employeeId: string) => {
    setViewedEmployeeId(employeeId)
    clear()
    setDialogOpen(false)
    setComment('')
    setAsApproved(false)
  }

  const requests = useMemo(
    () => requestsOf(database.requests, viewedEmployee.id, year),
    [database.requests, viewedEmployee.id, year],
  )

  const marks = useMemo(() => {
    const map = new Map<IsoDate, DayMark>()
    for (const request of requests) {
      if (request.status === 'rechazada') continue
      for (const day of request.days) map.set(day, request.status)
    }
    return map
  }, [requests])

  const balance = useMemo(
    () =>
      computeBalance(
        viewedEmployee,
        year,
        database.settings,
        database.allowances,
        database.requests,
      ),
    [viewedEmployee, year, database],
  )

  const selectedDays = useMemo(() => [...selected].sort(), [selected])

  const submit = () => {
    const ok = apply((db) =>
      createVacation(db, {
        employeeId: viewedEmployee.id,
        days: selectedDays,
        status: asApproved ? 'aprobada' : 'pendiente',
        authorId: currentUser.id,
        comment,
      }),
    )
    if (ok) {
      const forThem = viewingSelf ? '' : ` para ${displayName(viewedEmployee)}`
      notify(
        asApproved ? `Vacaciones creadas y aprobadas${forThem}.` : `Solicitud enviada${forThem}.`,
      )
      clear()
      setComment('')
      setDialogOpen(false)
    }
  }

  const cancel = (requestId: string) => {
    if (apply((db) => removeRequest(db, requestId, currentUser))) {
      notify(viewingSelf ? 'Solicitud cancelada.' : 'Solicitud eliminada.')
    }
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl">
                {viewingSelf ? 'Mi calendario' : `Calendario de ${displayName(viewedEmployee)}`}
              </h1>
              <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                Pulsa un día para seleccionarlo. Con la tecla mayúsculas seleccionas el rango
                completo desde el último día marcado. Los domingos y festivos no computan.
              </p>
            </div>

            {isAdmin && (
              <div>
                <label className="label" htmlFor="viewed-employee">
                  Ver calendario de
                </label>
                <select
                  id="viewed-employee"
                  className="field"
                  value={viewedEmployee.id}
                  onChange={(event) => switchTo(event.target.value)}
                >
                  {viewableEmployees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {displayName(employee)}
                      {employee.id === currentUser.id ? ' (tú)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <Legend />
        </div>
        <BalanceCard balance={balance} />
      </div>

      <div className="card p-4 sm:p-6">
        <YearCalendar
          year={year}
          calendar={calendar}
          markOf={(date) => marks.get(date)}
          selected={selected}
          today={todayIso()}
          onToggle={toggle}
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg">
          {viewingSelf
            ? `Mis solicitudes de ${year}`
            : `Solicitudes de ${displayName(viewedEmployee)} en ${year}`}
        </h2>
        {requests.length === 0 ? (
          <p className="card p-6 text-sm text-[var(--color-ink-muted)]">
            {viewingSelf
              ? 'Todavía no has solicitado vacaciones este año.'
              : 'Sin vacaciones solicitadas este año.'}
          </p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {[...requests]
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .map((request) => (
                <RequestCard
                  key={request.id}
                  request={request}
                  actions={
                    request.status === 'pendiente' || isAdmin ? (
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => cancel(request.id)}
                      >
                        {request.status === 'pendiente' ? 'Cancelar' : 'Eliminar'}
                      </button>
                    ) : null
                  }
                />
              ))}
          </div>
        )}
      </section>

      {selectedDays.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 p-4">
          <div
            className="card glass mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3 px-4 py-3"
            style={{ boxShadow: 'var(--shadow-raised)' }}
          >
            <p className="text-sm">
              <span className="font-semibold">
                {selectedDays.length} {selectedDays.length === 1 ? 'día' : 'días'}
              </span>{' '}
              <span className="text-[var(--color-ink-muted)]">{summarizeDays(selectedDays)}</span>
            </p>
            <div className="flex gap-2">
              <button type="button" className="btn btn-secondary btn-sm" onClick={clear}>
                Limpiar
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  setAsApproved(false)
                  setDialogOpen(true)
                }}
              >
                Solicitar
              </button>
            </div>
          </div>
        </div>
      )}

      {dialogOpen && (
        <Modal
          title={
            viewingSelf ? 'Solicitar vacaciones' : `Vacaciones de ${displayName(viewedEmployee)}`
          }
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
                {asApproved ? 'Crear aprobadas' : 'Enviar solicitud'}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="label" htmlFor="comment">
                Comentario (opcional)
              </label>
              <textarea
                id="comment"
                className="field"
                rows={3}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Motivo, preferencias, sustituciones…"
              />
            </div>

            {isAdmin && (
              <label className="hairline flex items-center gap-3 rounded-[var(--radius-control)] border p-3 text-sm">
                <input
                  type="checkbox"
                  checked={asApproved}
                  onChange={(event) => setAsApproved(event.target.checked)}
                />
                Crear directamente como aprobadas, sin pasar por solicitud
              </label>
            )}

            <p className="text-xs text-[var(--color-ink-muted)]">
              Quedan {pluralDays(balance.available)} disponibles de los{' '}
              {formatDays(balance.assigned)} asignados para {year}.
            </p>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Legend() {
  const items = [
    { label: 'Aprobadas', background: 'var(--color-approved)' },
    { label: 'Pendientes', background: 'var(--color-pending)' },
    { label: 'Festivo', background: 'var(--color-holiday-soft)' },
    { label: 'No laborable', background: 'var(--color-surface-sunken)' },
  ]

  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-[var(--color-ink-muted)]">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            className="hairline inline-block size-3 rounded-[4px] border"
            style={{ background: item.background }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  )
}

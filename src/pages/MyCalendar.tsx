import { useCallback, useMemo, useState } from 'react'
import { computeBalance, requestsOf } from '../domain/balance'
import { todayIso } from '../domain/dates'
import type { IsoDate } from '../domain/types'
import { isWorkingDay } from '../domain/workdays'
import { createVacation, removeRequest } from '../state/actions'
import { useSession } from '../state/AppStore'
import { BalanceCard } from '../ui/BalanceCard'
import { Modal } from '../ui/Modal'
import { RequestCard } from '../ui/RequestCard'
import { summarizeDays } from '../ui/calendarGrid'
import type { DayMark } from '../ui/MonthCalendar'
import { useDaySelection } from '../ui/useDaySelection'
import { YearCalendar } from '../ui/YearCalendar'

export function MyCalendar() {
  const { database, currentUser, year, calendar, apply, notify } = useSession()
  const [comment, setComment] = useState('')
  const [asApproved, setAsApproved] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  const canSelect = useCallback((date: IsoDate) => isWorkingDay(calendar, date), [calendar])
  const { selected, toggle, clear } = useDaySelection(canSelect)

  const myRequests = useMemo(
    () => requestsOf(database.requests, currentUser.id, year),
    [database.requests, currentUser.id, year],
  )

  const marks = useMemo(() => {
    const map = new Map<IsoDate, DayMark>()
    for (const request of myRequests) {
      if (request.status === 'rechazada') continue
      for (const day of request.days) map.set(day, request.status)
    }
    return map
  }, [myRequests])

  const balance = useMemo(
    () => computeBalance(currentUser, year, database.settings, database.allowances, database.requests),
    [currentUser, year, database],
  )

  const selectedDays = useMemo(() => [...selected].sort(), [selected])

  const submit = () => {
    const ok = apply((db) =>
      createVacation(db, {
        employeeId: currentUser.id,
        days: selectedDays,
        status: asApproved ? 'aprobada' : 'pendiente',
        authorId: currentUser.id,
        comment,
      }),
    )
    if (ok) {
      notify(asApproved ? 'Vacaciones creadas y aprobadas.' : 'Solicitud enviada.')
      clear()
      setComment('')
      setDialogOpen(false)
    }
  }

  const cancel = (requestId: string) => {
    if (apply((db) => removeRequest(db, requestId, currentUser))) {
      notify('Solicitud cancelada.')
    }
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl">Mi calendario</h1>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
              Pulsa un día para seleccionarlo. Con la tecla mayúsculas seleccionas el rango completo
              desde el último día marcado. Los domingos y festivos no computan.
            </p>
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
        <h2 className="text-lg">Mis solicitudes de {year}</h2>
        {myRequests.length === 0 ? (
          <p className="card p-6 text-sm text-[var(--color-ink-muted)]">
            Todavía no has solicitado vacaciones este año.
          </p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {[...myRequests]
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .map((request) => (
                <RequestCard
                  key={request.id}
                  request={request}
                  actions={
                    request.status === 'pendiente' || currentUser.role === 'admin' ? (
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
          title="Solicitar vacaciones"
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

            {currentUser.role === 'admin' && (
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
              Quedan {balance.available} {balance.available === 1 ? 'día' : 'días'} disponibles de
              los {balance.assigned} asignados para {year}.
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

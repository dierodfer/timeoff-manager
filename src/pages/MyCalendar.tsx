import { Info } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { isActiveInYear } from '../domain/accrual'
import { computeBalance, requestsOf } from '../domain/balance'
import { formatDays, pluralDays, truncateDays } from '../domain/format'
import { compareIso, todayIso } from '../domain/dates'
import type { Employee, IsoDate } from '../domain/types'
import { isWorkingDay } from '../domain/workdays'
import { createVacation, displayName, sortByName } from '../state/actions'
import { useSession } from '../state/appContext'
import { BalanceCard } from '../ui/BalanceCard'
import { Modal } from '../ui/Modal'
import { summarizeDays } from '../ui/calendarGrid'
import type { DayMark } from '../ui/MonthCalendar'
import { useDaySelection, type SelectionLimit } from '../ui/useDaySelection'
import { YearCalendar } from '../ui/YearCalendar'

const TODAY_YEAR = Number(todayIso().slice(0, 4))

export function MyCalendar() {
  const { database, currentUser, year, setYear, calendar, apply, notify } = useSession()
  const isAdmin = currentUser.role === 'admin'

  const viewableEmployees = useMemo(
    () => sortByName(database.employees.filter((employee) => isActiveInYear(employee, year))),
    [database.employees, year],
  )

  const [params, setParams] = useSearchParams()
  const [comment, setComment] = useState('')
  const [asApproved, setAsApproved] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  // Derivado, no estado: sincronizarlo con un efecto provoca renders en cascada. Vive en la URL
  // para que volver desde Mis solicitudes conserve a quién mira el administrador.
  const viewedEmployee: Employee =
    (isAdmin && viewableEmployees.find((employee) => employee.id === params.get('empleado'))) ||
    currentUser
  const viewingSelf = viewedEmployee.id === currentUser.id
  const requestsPath = viewingSelf
    ? '/mis-solicitudes'
    : `/mis-solicitudes?empleado=${viewedEmployee.id}`

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

  const canSelect = useCallback(
    (date: IsoDate) => isWorkingDay(calendar, date) && !marks.get(date),
    [calendar, marks],
  )
  const selectionLimit: SelectionLimit = useMemo(
    () => ({
      max: balance.available,
      onExceeded: () =>
        notify(
          `Solo tienes ${pluralDays(truncateDays(balance.available))} disponibles para ${year}, no puedes solicitar más.`,
          'error',
        ),
    }),
    [balance.available, year, notify],
  )
  const { selected, toggle, clear } = useDaySelection(canSelect, selectionLimit)

  const switchTo = (employeeId: string) => {
    setParams(employeeId === currentUser.id ? {} : { empleado: employeeId }, { replace: true })
    clear()
    setDialogOpen(false)
    setComment('')
    setAsApproved(false)
  }

  const selectedDays = useMemo(() => [...selected].sort(compareIso), [selected])

  const openRequestDialog = () => {
    setAsApproved(false)
    setDialogOpen(true)
  }

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl">
            {viewingSelf ? 'Mis vacaciones' : `Vacaciones de ${displayName(viewedEmployee)}`}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            {viewingSelf
              ? 'Selecciona los días que quieres solicitar.'
              : 'Días laborables seleccionables en su nombre.'}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
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
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={year === TODAY_YEAR}
            onClick={() => setYear(TODAY_YEAR)}
          >
            Hoy
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="space-y-4">
          <Legend />
          <div className="card p-4 sm:p-6">
            {selectedDays.length > 0 && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] bg-[var(--color-accent-soft)] px-3 py-2 text-sm">
                <p>
                  <span className="font-semibold">
                    {selectedDays.length} {selectedDays.length === 1 ? 'día' : 'días'}
                  </span>{' '}
                  <span className="text-[var(--color-ink-muted)]">
                    {summarizeDays(selectedDays)}
                  </span>
                </p>
                <button type="button" className="btn btn-quiet btn-sm" onClick={clear}>
                  Limpiar
                </button>
              </div>
            )}
            <YearCalendar
              year={year}
              calendar={calendar}
              markOf={(date) => marks.get(date)}
              selected={selected}
              today={todayIso()}
              onToggle={toggle}
            />
          </div>
        </div>

        <div className="space-y-4">
          <BalanceCard
            balance={balance}
            onRequest={openRequestDialog}
            requestDisabled={selectedDays.length === 0}
            requestsTo={requestsPath}
          />

          <section className="rounded-[var(--radius-card)] border border-[var(--color-accent)]/25 bg-[var(--color-accent-soft)] p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-[var(--color-accent)]">
              <Info className="size-4" />
              Ten en cuenta
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--color-ink-soft)]">
              <li>Solo puedes seleccionar días laborables.</li>
              <li>Las solicitudes quedan pendientes hasta que las aprueba un administrador.</li>
              <li>Puedes cancelar una solicitud mientras siga pendiente.</li>
            </ul>
          </section>
        </div>
      </div>

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
                />{' '}
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
    { label: 'Seleccionado', background: 'var(--color-accent)' },
    { label: 'Aprobada', background: 'var(--color-approved)' },
    { label: 'Pendiente', background: 'var(--color-pending)' },
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

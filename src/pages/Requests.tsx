import { useMemo, useState } from 'react'
import { formatDate } from '../domain/format'
import type { Employee, IsoDate, RequestComment, RequestStatus } from '../domain/types'
import {
  addRequestComment,
  displayName,
  removeRequestDay,
  resolveAllPending,
  resolveRequestDay,
  sortByName,
} from '../state/actions'
import { useSession } from '../state/appContext'
import { STATUS_LABEL } from '../ui/calendarGrid'
import { Modal } from '../ui/Modal'

type Filter = RequestStatus | 'todas'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'aprobada', label: 'Aprobadas' },
  { value: 'rechazada', label: 'Rechazadas' },
  { value: 'todas', label: 'Todas' },
]

interface DayRow {
  day: IsoDate
  status: RequestStatus
  requestId: string
  comments: RequestComment[]
}

interface EmployeeGroup {
  employee: Employee
  rows: DayRow[]
  pendingCount: number
}

type Dialog =
  | { kind: 'rechazar'; requestId: string; day: IsoDate }
  | { kind: 'comentar'; requestId: string }
  | { kind: 'aprobar-todos'; employeeId: string; employeeName: string; count: number }
  | null

export function Requests() {
  const { database, currentUser, year, apply, notify } = useSession()
  const [filter, setFilter] = useState<Filter>('pendiente')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [comment, setComment] = useState('')

  const groups = useMemo(() => {
    const byEmployee = new Map<string, DayRow[]>()

    for (const request of database.requests) {
      if (request.year !== year) continue
      if (filter !== 'todas' && request.status !== filter) continue

      const rows = byEmployee.get(request.employeeId) ?? []
      for (const day of request.days) {
        rows.push({
          day,
          status: request.status,
          requestId: request.id,
          comments: request.comments,
        })
      }
      byEmployee.set(request.employeeId, rows)
    }

    const employees = sortByName(
      database.employees.filter((employee) => byEmployee.has(employee.id)),
    )

    return employees.map((employee): EmployeeGroup => {
      const rows = [...(byEmployee.get(employee.id) ?? [])].sort((a, b) =>
        a.day.localeCompare(b.day),
      )
      return {
        employee,
        rows,
        pendingCount: rows.filter((row) => row.status === 'pendiente').length,
      }
    })
  }, [database.requests, database.employees, year, filter])

  const approveDay = (requestId: string, day: IsoDate) => {
    if (apply((db) => resolveRequestDay(db, requestId, day, 'aprobada', currentUser.id))) {
      notify('Día aprobado.')
    }
  }

  const removeDay = (requestId: string, day: IsoDate) => {
    if (apply((db) => removeRequestDay(db, requestId, day, currentUser))) {
      notify('Día eliminado.')
    }
  }

  const confirmDialog = () => {
    if (!dialog) return

    if (dialog.kind === 'rechazar') {
      if (
        apply((db) =>
          resolveRequestDay(db, dialog.requestId, dialog.day, 'rechazada', currentUser.id, comment),
        )
      ) {
        notify('Día rechazado.')
        setDialog(null)
        setComment('')
      }
      return
    }

    if (dialog.kind === 'comentar') {
      if (apply((db) => addRequestComment(db, dialog.requestId, currentUser.id, comment))) {
        notify('Comentario añadido.')
        setDialog(null)
        setComment('')
      }
      return
    }

    if (apply((db) => resolveAllPending(db, dialog.employeeId, year, 'aprobada', currentUser.id))) {
      notify(
        `${dialog.count} ${dialog.count === 1 ? 'día aprobado' : 'días aprobados'} para ${dialog.employeeName}.`,
      )
      setDialog(null)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl">Solicitudes {year}</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Agrupadas por persona. Aprueba o rechaza cada día, o apruébalos todos de una vez.
          </p>
        </div>

        <div className="segmented">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={filter === item.value}
              onClick={() => setFilter(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="card p-6 text-sm text-[var(--color-ink-muted)]">
          No hay solicitudes que mostrar con este filtro.
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <section key={group.employee.id} className="card overflow-hidden">
              <div className="hairline flex flex-wrap items-center justify-between gap-3 border-b bg-[var(--color-surface-sunken)] px-5 py-3">
                <div>
                  <h2 className="text-[15px] font-semibold">{displayName(group.employee)}</h2>
                  <p className="text-xs text-[var(--color-ink-muted)]">
                    {group.rows.length} {group.rows.length === 1 ? 'día' : 'días'}
                    {group.pendingCount > 0 ? ` · ${group.pendingCount} pendientes` : ''}
                  </p>
                </div>

                {group.pendingCount > 0 && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() =>
                      setDialog({
                        kind: 'aprobar-todos',
                        employeeId: group.employee.id,
                        employeeName: displayName(group.employee),
                        count: group.pendingCount,
                      })
                    }
                  >
                    Aprobar todos
                  </button>
                )}
              </div>

              <ul className="divide-y divide-[var(--color-hairline)]">
                {group.rows.map((row) => (
                  <li
                    key={`${row.requestId}-${row.day}`}
                    className="flex flex-wrap items-center gap-3 px-5 py-3"
                  >
                    <span className="tabular w-44 shrink-0 text-sm text-[var(--color-ink-soft)]">
                      {formatDate(row.day)}
                    </span>
                    <span className={`chip chip-${row.status}`}>{STATUS_LABEL[row.status]}</span>

                    {row.comments.length > 0 && (
                      <span className="min-w-0 flex-1 truncate text-xs text-[var(--color-ink-muted)]">
                        {row.comments.map((comment) => comment.text).join(' · ')}
                      </span>
                    )}

                    <div className="ml-auto flex gap-2">
                      <button
                        type="button"
                        className="btn btn-quiet btn-sm"
                        onClick={() => {
                          setComment('')
                          setDialog({ kind: 'comentar', requestId: row.requestId })
                        }}
                      >
                        Comentar
                      </button>

                      {row.status === 'pendiente' ? (
                        <>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => {
                              setComment('')
                              setDialog({
                                kind: 'rechazar',
                                requestId: row.requestId,
                                day: row.day,
                              })
                            }}
                          >
                            Rechazar
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => approveDay(row.requestId, row.day)}
                          >
                            Aprobar
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => removeDay(row.requestId, row.day)}
                        >
                          Eliminar
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {dialog?.kind === 'aprobar-todos' && (
        <Modal
          title={`Aprobar todos los días de ${dialog.employeeName}`}
          description={`Se aprobarán ${dialog.count} ${dialog.count === 1 ? 'día pendiente' : 'días pendientes'}.`}
          onClose={() => setDialog(null)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setDialog(null)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={confirmDialog}>
                Aprobar todos
              </button>
            </>
          }
        >
          <p className="text-sm text-[var(--color-ink-soft)]">
            Cada solicitud pendiente de {dialog.employeeName} en {year} quedará aprobada.
          </p>
        </Modal>
      )}

      {(dialog?.kind === 'rechazar' || dialog?.kind === 'comentar') && (
        <Modal
          title={dialog.kind === 'rechazar' ? 'Rechazar día' : 'Añadir comentario'}
          description={
            dialog.kind === 'rechazar' ? 'El día vuelve al saldo del empleado.' : undefined
          }
          onClose={() => setDialog(null)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setDialog(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className={dialog.kind === 'rechazar' ? 'btn btn-danger' : 'btn btn-primary'}
                disabled={dialog.kind === 'comentar' && !comment.trim()}
                onClick={confirmDialog}
              >
                {dialog.kind === 'rechazar' ? 'Rechazar' : 'Añadir'}
              </button>
            </>
          }
        >
          <label className="label" htmlFor="dialog-comment">
            {dialog.kind === 'rechazar' ? 'Motivo (opcional)' : 'Comentario'}
          </label>
          <textarea
            id="dialog-comment"
            className="field"
            rows={4}
            autoFocus
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
        </Modal>
      )}
    </div>
  )
}

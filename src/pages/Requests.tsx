import { Check, CheckCheck, ChevronDown, ChevronUp, MessageSquare, Trash2, X } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { formatDate, formatWeekdayShort, pluralDays } from '../domain/format'
import type { Employee, IsoDate, RequestComment, RequestStatus } from '../domain/types'
import {
  addRequestDayComment,
  displayName,
  removeRequestDay,
  resolveAllPending,
  resolveRequestDay,
  resolveRequestDays,
  sortByName,
  type RequestDaySelection,
} from '../state/actions'
import { useSession } from '../state/appContext'
import { Avatar } from '../ui/Avatar'
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
  requestCount: number
  totalDays: number
}

type Dialog =
  | { kind: 'rechazar'; requestId: string; day: IsoDate }
  | { kind: 'comentar'; requestId: string; day: IsoDate }
  | { kind: 'aprobar-todos'; employeeId: string; employeeName: string; count: number }
  | {
      kind: 'rechazar-seleccion'
      employeeId: string
      employeeName: string
      selections: RequestDaySelection[]
    }
  | null

function rowKey(requestId: string, day: IsoDate): string {
  return `${requestId}|${day}`
}

function toggleInSet(set: Set<string>, key: string): Set<string> {
  const next = new Set(set)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  return next
}

export function Requests() {
  const { database, currentUser, year, apply, notify } = useSession()
  const [filter, setFilter] = useState<Filter>('pendiente')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [comment, setComment] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [openThreads, setOpenThreads] = useState<Set<string>>(new Set())

  const changeFilter = (value: Filter) => {
    setFilter(value)
    setSelected(new Set())
  }

  const tabCounts = useMemo(() => {
    const counts: Record<RequestStatus, number> = { pendiente: 0, aprobada: 0, rechazada: 0 }
    for (const request of database.requests) {
      if (request.year !== year) continue
      counts[request.status] += request.days.length
    }
    return counts
  }, [database.requests, year])

  const groups = useMemo(() => {
    const rowsByEmployee = new Map<string, DayRow[]>()
    const totalsByEmployee = new Map<string, { requestCount: number; totalDays: number }>()

    for (const request of database.requests) {
      if (request.year !== year) continue

      const totals = totalsByEmployee.get(request.employeeId) ?? { requestCount: 0, totalDays: 0 }
      totals.requestCount += 1
      totals.totalDays += request.days.length
      totalsByEmployee.set(request.employeeId, totals)

      if (filter !== 'todas' && request.status !== filter) continue
      const rows = rowsByEmployee.get(request.employeeId) ?? []
      for (const day of request.days) {
        rows.push({
          day,
          status: request.status,
          requestId: request.id,
          comments: request.comments,
        })
      }
      rowsByEmployee.set(request.employeeId, rows)
    }

    const employees = sortByName(
      database.employees.filter((employee) => rowsByEmployee.has(employee.id)),
    )

    return employees.map((employee): EmployeeGroup => {
      const rows = [...(rowsByEmployee.get(employee.id) ?? [])].sort((a, b) =>
        a.day.localeCompare(b.day),
      )
      const totals = totalsByEmployee.get(employee.id) ?? { requestCount: 0, totalDays: 0 }
      return {
        employee,
        rows,
        pendingCount: rows.filter((row) => row.status === 'pendiente').length,
        requestCount: totals.requestCount,
        totalDays: totals.totalDays,
      }
    })
  }, [database.requests, database.employees, year, filter])

  const toggleCollapsed = (employeeId: string) =>
    setCollapsed((current) => toggleInSet(current, employeeId))

  const toggleThread = (requestId: string, day: IsoDate) =>
    setOpenThreads((current) => toggleInSet(current, rowKey(requestId, day)))

  const toggleSelected = (requestId: string, day: IsoDate) =>
    setSelected((current) => toggleInSet(current, rowKey(requestId, day)))

  const pendingKeysOf = (group: EmployeeGroup) =>
    group.rows
      .filter((row) => row.status === 'pendiente')
      .map((row) => rowKey(row.requestId, row.day))

  const selectionOf = (group: EmployeeGroup): RequestDaySelection[] =>
    group.rows
      .filter((row) => row.status === 'pendiente' && selected.has(rowKey(row.requestId, row.day)))
      .map((row) => ({ requestId: row.requestId, day: row.day }))

  const toggleSelectAll = (group: EmployeeGroup) => {
    const keys = pendingKeysOf(group)
    const allSelected = keys.length > 0 && keys.every((key) => selected.has(key))
    setSelected((current) => {
      const next = new Set(current)
      for (const key of keys) {
        if (allSelected) next.delete(key)
        else next.add(key)
      }
      return next
    })
  }

  const clearGroupSelection = (group: EmployeeGroup) => {
    const keys = new Set(pendingKeysOf(group))
    setSelected((current) => new Set([...current].filter((key) => !keys.has(key))))
  }

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

  const approveSelected = (group: EmployeeGroup) => {
    const selections = selectionOf(group)
    if (selections.length === 0) return
    if (apply((db) => resolveRequestDays(db, selections, 'aprobada', currentUser.id))) {
      notify(`${selections.length} ${selections.length === 1 ? 'día aprobado' : 'días aprobados'}.`)
      clearGroupSelection(group)
    }
  }

  const openRejectSelection = (group: EmployeeGroup) => {
    const selections = selectionOf(group)
    if (selections.length === 0) return
    setComment('')
    setDialog({
      kind: 'rechazar-seleccion',
      employeeId: group.employee.id,
      employeeName: displayName(group.employee),
      selections,
    })
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
      if (
        apply((db) =>
          addRequestDayComment(db, dialog.requestId, dialog.day, currentUser.id, comment),
        )
      ) {
        notify('Comentario añadido.')
        setDialog(null)
        setComment('')
      }
      return
    }

    if (dialog.kind === 'rechazar-seleccion') {
      if (
        apply((db) =>
          resolveRequestDays(db, dialog.selections, 'rechazada', currentUser.id, comment),
        )
      ) {
        const count = dialog.selections.length
        notify(`${count} ${count === 1 ? 'día rechazado' : 'días rechazados'}.`)
        setSelected((current) => {
          const keys = new Set(dialog.selections.map((item) => rowKey(item.requestId, item.day)))
          return new Set([...current].filter((key) => !keys.has(key)))
        })
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
      <div>
        <h1 className="text-2xl">Solicitudes de vacaciones</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Revisa y gestiona las solicitudes de tu equipo, agrupadas por persona.
        </p>
      </div>

      <div className="flex flex-wrap gap-1">
        {FILTERS.map((item) => {
          const count =
            item.value === 'todas'
              ? tabCounts.pendiente + tabCounts.aprobada + tabCounts.rechazada
              : tabCounts[item.value]
          return (
            <button
              key={item.value}
              type="button"
              className="filter-tab"
              aria-pressed={filter === item.value}
              onClick={() => changeFilter(item.value)}
            >
              {item.label}
              <span className="filter-tab-count tabular">{count}</span>
            </button>
          )
        })}
      </div>

      {groups.length === 0 ? (
        <p className="card p-6 text-sm text-[var(--color-ink-muted)]">
          No hay solicitudes que mostrar con este filtro.
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => {
            const isCollapsed = collapsed.has(group.employee.id)
            const pendingKeys = pendingKeysOf(group)
            const selectionCount = selectionOf(group).length
            const allSelected = pendingKeys.length > 0 && selectionCount === pendingKeys.length

            return (
              <section key={group.employee.id} className="card overflow-hidden">
                <div className="hairline flex flex-wrap items-center justify-between gap-3 border-b bg-[var(--color-surface-sunken)] px-5 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar employee={group.employee} size="lg" />
                    <div className="min-w-0">
                      <h2 className="truncate text-[15px] font-semibold">
                        {displayName(group.employee)}
                      </h2>
                      <p className="text-xs text-[var(--color-ink-muted)]">
                        {group.requestCount}{' '}
                        {group.requestCount === 1 ? 'solicitud' : 'solicitudes'} ·{' '}
                        {pluralDays(group.totalDays)} en total
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {selectionCount > 0 ? (
                      <>
                        <span className="text-xs text-[var(--color-ink-muted)]">
                          {selectionCount} {selectionCount === 1 ? 'seleccionado' : 'seleccionados'}
                        </span>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => approveSelected(group)}
                        >
                          <Check className="size-4" />
                          Aprobar seleccionados
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => openRejectSelection(group)}
                        >
                          <X className="size-4" />
                          Rechazar seleccionados
                        </button>
                        <button
                          type="button"
                          className="btn btn-quiet btn-sm"
                          onClick={() => clearGroupSelection(group)}
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      group.pendingCount > 0 && (
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
                          <CheckCheck className="size-4" />
                          Aprobar todos ({group.pendingCount})
                        </button>
                      )
                    )}

                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={
                        isCollapsed
                          ? `Expandir ${displayName(group.employee)}`
                          : `Contraer ${displayName(group.employee)}`
                      }
                      onClick={() => toggleCollapsed(group.employee.id)}
                    >
                      {isCollapsed ? (
                        <ChevronDown className="size-4" />
                      ) : (
                        <ChevronUp className="size-4" />
                      )}
                    </button>
                  </div>
                </div>

                {!isCollapsed && (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[58rem] table-fixed text-sm">
                      <thead>
                        <tr className="border-b border-[var(--color-hairline)] bg-[var(--color-surface-sunken)]/60 text-xs font-medium text-[var(--color-ink-muted)]">
                          <th className="w-10 px-5 py-2 text-left font-medium">
                            <input
                              type="checkbox"
                              aria-label={`Seleccionar todos los días pendientes de ${displayName(group.employee)}`}
                              checked={allSelected}
                              disabled={pendingKeys.length === 0}
                              ref={(element) => {
                                if (element) {
                                  element.indeterminate = selectionCount > 0 && !allSelected
                                }
                              }}
                              onChange={() => toggleSelectAll(group)}
                            />
                          </th>
                          <th className="w-32 px-2 py-2 text-left font-medium">Fecha</th>
                          <th className="w-28 px-2 py-2 text-left font-medium">Estado</th>
                          <th className="px-2 py-2 text-left font-medium">Comentarios</th>
                          <th className="w-16 px-2 py-2 text-left font-medium">Días</th>
                          <th className="w-[23rem] px-5 py-2 text-right font-medium">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--color-hairline)]">
                        {group.rows.map((row) => {
                          const key = rowKey(row.requestId, row.day)
                          const isThreadOpen = openThreads.has(key)

                          return (
                            <Fragment key={key}>
                              <tr className="hover:bg-[var(--color-surface-sunken)]/40">
                                <td className="px-5 py-3 align-top">
                                  {row.status === 'pendiente' && (
                                    <input
                                      type="checkbox"
                                      aria-label={`Seleccionar el ${formatDate(row.day)}`}
                                      checked={selected.has(key)}
                                      onChange={() => toggleSelected(row.requestId, row.day)}
                                    />
                                  )}
                                </td>
                                <td className="px-2 py-3 align-top">
                                  <p className="tabular text-[var(--color-ink-soft)]">
                                    {formatDate(row.day)}
                                  </p>
                                  <p className="text-xs text-[var(--color-ink-muted)]">
                                    {formatWeekdayShort(row.day)}
                                  </p>
                                </td>
                                <td className="px-2 py-3 align-top">
                                  <span className={`chip chip-${row.status}`}>
                                    {STATUS_LABEL[row.status]}
                                  </span>
                                </td>
                                <td className="max-w-0 px-2 py-3 align-top">
                                  {row.comments.length === 0 ? (
                                    <span className="text-xs text-[var(--color-ink-muted)]">—</span>
                                  ) : (
                                    <button
                                      type="button"
                                      className="flex w-full items-center gap-1 text-left text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                                      onClick={() => toggleThread(row.requestId, row.day)}
                                    >
                                      <span className="min-w-0 flex-1 truncate">
                                        {row.comments.at(-1)?.text}
                                      </span>
                                      {row.comments.length > 1 && (
                                        <span className="tabular shrink-0">
                                          +{row.comments.length - 1}
                                        </span>
                                      )}
                                      {isThreadOpen ? (
                                        <ChevronUp className="size-3.5 shrink-0" />
                                      ) : (
                                        <ChevronDown className="size-3.5 shrink-0" />
                                      )}
                                    </button>
                                  )}
                                </td>
                                <td className="px-2 py-3 align-top text-xs text-[var(--color-ink-muted)]">
                                  1 día
                                </td>
                                <td className="px-5 py-3 align-top">
                                  <div className="flex justify-end gap-2">
                                    <button
                                      type="button"
                                      className="btn btn-secondary btn-sm"
                                      onClick={() => {
                                        setComment('')
                                        setDialog({
                                          kind: 'comentar',
                                          requestId: row.requestId,
                                          day: row.day,
                                        })
                                      }}
                                    >
                                      <MessageSquare className="size-3.5" />
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
                                          <X className="size-3.5" />
                                          Rechazar
                                        </button>
                                        <button
                                          type="button"
                                          className="btn btn-primary btn-sm"
                                          onClick={() => approveDay(row.requestId, row.day)}
                                        >
                                          <Check className="size-3.5" />
                                          Aprobar
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        type="button"
                                        className="btn btn-danger btn-sm"
                                        onClick={() => removeDay(row.requestId, row.day)}
                                      >
                                        <Trash2 className="size-3.5" />
                                        Eliminar
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>

                              {isThreadOpen && row.comments.length > 0 && (
                                <tr>
                                  <td
                                    colSpan={6}
                                    className="space-y-2 bg-[var(--color-surface-sunken)] px-5 py-3"
                                  >
                                    {row.comments.map((item) => (
                                      <p key={item.id} className="text-xs">
                                        <span className="font-medium text-[var(--color-ink)]">
                                          {item.authorName}
                                        </span>{' '}
                                        <span className="text-[var(--color-ink-muted)]">
                                          · {formatDate(item.createdAt)}
                                        </span>
                                        <br />
                                        <span className="text-[var(--color-ink-soft)]">
                                          {item.text}
                                        </span>
                                      </p>
                                    ))}
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      {dialog?.kind === 'aprobar-todos' && (
        <Modal
          title={`Aprobar todos los días de ${dialog.employeeName}`}
          description={`Se aprobarán ${dialog.count} ${dialog.count === 1 ? 'día pendiente' : 'días pendientes'}.`}
          onClose={() => setDialog(null)}
          confirm={{ label: 'Aprobar todos', onClick: confirmDialog }}
        >
          <p className="text-sm text-[var(--color-ink-soft)]">
            Cada solicitud pendiente de {dialog.employeeName} en {year} quedará aprobada.
          </p>
        </Modal>
      )}

      {dialog?.kind === 'rechazar-seleccion' && (
        <Modal
          title={`Rechazar ${dialog.selections.length} ${dialog.selections.length === 1 ? 'día' : 'días'} de ${dialog.employeeName}`}
          description="Los días vuelven al saldo del empleado."
          onClose={() => setDialog(null)}
          confirm={{ label: 'Rechazar seleccionados', danger: true, onClick: confirmDialog }}
        >
          <label className="label" htmlFor="dialog-comment">
            Motivo (opcional, se aplica a todos los días seleccionados)
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

      {(dialog?.kind === 'rechazar' || dialog?.kind === 'comentar') && (
        <Modal
          title={dialog.kind === 'rechazar' ? 'Rechazar día' : 'Añadir comentario'}
          description={
            dialog.kind === 'rechazar' ? 'El día vuelve al saldo del empleado.' : undefined
          }
          onClose={() => setDialog(null)}
          confirm={
            dialog.kind === 'rechazar'
              ? { label: 'Rechazar', danger: true, onClick: confirmDialog }
              : { label: 'Añadir', disabled: !comment.trim(), onClick: confirmDialog }
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

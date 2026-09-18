import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { formatDate } from '../domain/format'
import type { IsoDate, RequestComment, RequestStatus } from '../domain/types'
import {
  addRequestDayComment,
  displayName,
  removeRequestDay,
  resolveAllPending,
  resolveRequestDay,
  resolveRequestDays,
  type RequestDaySelection,
} from '../state/actions'
import { useSession } from '../state/appContext'
import { Modal } from '../ui/Modal'
import { RequestGroupCard } from '../ui/RequestGroupCard'
import {
  countDaysByStatus,
  groupRequestsByEmployee,
  pendingKeysOf,
  rowKey,
  selectionOf,
  toggleInSet,
  type EmployeeGroup,
  type RequestFilter,
} from '../ui/requestGroups'

const FILTERS: { value: RequestFilter; label: string }[] = [
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'aprobada', label: 'Aprobadas' },
  { value: 'rechazada', label: 'Rechazadas' },
  { value: 'todas', label: 'Todas' },
]

type Dialog =
  | { kind: 'comentar'; requestId: string; day: IsoDate; comments: RequestComment[] }
  | { kind: 'aprobar-todos'; employeeId: string; employeeName: string; count: number }
  | {
      kind: 'rechazar-seleccion'
      employeeId: string
      employeeName: string
      selections: RequestDaySelection[]
    }
  | null

export function Requests() {
  const { database, currentUser, year, apply, notify } = useSession()
  const [params] = useSearchParams()
  const [filter, setFilter] = useState<RequestFilter>('pendiente')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [comment, setComment] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const scopedEmployeeId = params.get('empleado')
  const scopedEmployee = database.employees.find((employee) => employee.id === scopedEmployeeId)

  const tabCounts = useMemo(
    () => countDaysByStatus(database.requests, year),
    [database.requests, year],
  )

  const groups = useMemo(() => {
    const all = groupRequestsByEmployee(database.requests, database.employees, year, filter)
    return scopedEmployeeId ? all.filter((group) => group.employee.id === scopedEmployeeId) : all
  }, [database.requests, database.employees, year, filter, scopedEmployeeId])

  const changeFilter = (value: RequestFilter) => {
    setFilter(value)
    setSelected(new Set())
  }

  const clearGroupSelection = (group: EmployeeGroup) => {
    const keys = new Set(pendingKeysOf(group))
    setSelected((current) => new Set([...current].filter((key) => !keys.has(key))))
  }

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

  const approveSelected = (group: EmployeeGroup) => {
    const selections = selectionOf(group, selected)
    if (selections.length === 0) return
    if (apply((db) => resolveRequestDays(db, selections, 'aprobada', currentUser.id))) {
      notify(`${selections.length} ${selections.length === 1 ? 'día aprobado' : 'días aprobados'}.`)
      clearGroupSelection(group)
    }
  }

  const openRejectSelection = (group: EmployeeGroup) => {
    const selections = selectionOf(group, selected)
    if (selections.length === 0) return
    setDialog({
      kind: 'rechazar-seleccion',
      employeeId: group.employee.id,
      employeeName: displayName(group.employee),
      selections,
    })
  }

  const openComment = (requestId: string, day: IsoDate, comments: RequestComment[]) => {
    setComment('')
    setDialog({ kind: 'comentar', requestId, day, comments })
  }

  const rejectDay = (requestId: string, day: IsoDate) => {
    if (apply((db) => resolveRequestDay(db, requestId, day, 'rechazada', currentUser.id))) {
      notify('Día rechazado.')
    }
  }

  const confirmDialog = () => {
    if (!dialog) return

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
      if (apply((db) => resolveRequestDays(db, dialog.selections, 'rechazada', currentUser.id))) {
        const count = dialog.selections.length
        notify(`${count} ${count === 1 ? 'día rechazado' : 'días rechazados'}.`)
        setSelected((current) => {
          const keys = new Set(dialog.selections.map((item) => rowKey(item.requestId, item.day)))
          return new Set([...current].filter((key) => !keys.has(key)))
        })
        setDialog(null)
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
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl">Solicitudes de vacaciones</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Revisa y gestiona las solicitudes de tu equipo, agrupadas por persona.
        </p>
      </div>

      {scopedEmployee && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--color-ink-muted)]">
          Mostrando solo a{' '}
          <span className="font-semibold text-[var(--color-ink)]">
            {displayName(scopedEmployee)}
          </span>
          <Link to="/solicitudes" className="text-[var(--color-accent)] hover:underline">
            Ver todos
          </Link>
        </div>
      )}

      <div className="flex flex-wrap gap-1">
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            className="filter-tab"
            aria-pressed={filter === item.value}
            onClick={() => changeFilter(item.value)}
          >
            {item.label}
            <span className="filter-tab-count tabular">{countFor(tabCounts, item.value)}</span>
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <p className="card p-6 text-sm text-[var(--color-ink-muted)]">
          No hay solicitudes que mostrar con este filtro.
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <RequestGroupCard
              key={group.employee.id}
              group={group}
              isCollapsed={collapsed.has(group.employee.id)}
              selected={selected}
              onToggleCollapsed={() =>
                setCollapsed((current) => toggleInSet(current, group.employee.id))
              }
              onToggleSelectAll={() => toggleSelectAll(group)}
              onToggleSelected={(requestId, day) =>
                setSelected((current) => toggleInSet(current, rowKey(requestId, day)))
              }
              onApproveSelected={() => approveSelected(group)}
              onRejectSelected={() => openRejectSelection(group)}
              onClearSelection={() => clearGroupSelection(group)}
              onApproveAll={() =>
                setDialog({
                  kind: 'aprobar-todos',
                  employeeId: group.employee.id,
                  employeeName: displayName(group.employee),
                  count: group.pendingCount,
                })
              }
              onComment={openComment}
              onReject={rejectDay}
              onApprove={(requestId, day) => {
                if (
                  apply((db) => resolveRequestDay(db, requestId, day, 'aprobada', currentUser.id))
                )
                  notify('Día aprobado.')
              }}
              onRemove={(requestId, day) => {
                if (apply((db) => removeRequestDay(db, requestId, day, currentUser)))
                  notify('Día eliminado.')
              }}
            />
          ))}
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
          <p className="text-sm text-[var(--color-ink-soft)]">Esta acción no se puede deshacer.</p>
        </Modal>
      )}

      {dialog?.kind === 'comentar' && (
        <Modal
          title="Comentarios"
          onClose={() => setDialog(null)}
          confirm={{ label: 'Añadir', disabled: !comment.trim(), onClick: confirmDialog }}
        >
          <div className="space-y-4">
            {dialog.comments.length > 0 && (
              <ul className="hairline space-y-2 border-b pb-4">
                {dialog.comments.map((item) => (
                  <li key={item.id} className="text-sm">
                    <span className="font-medium text-[var(--color-ink)]">{item.authorName}</span>{' '}
                    <span className="text-xs text-[var(--color-ink-muted)]">
                      · {formatDate(item.createdAt)}
                    </span>
                    <p className="text-[var(--color-ink-soft)]">{item.text}</p>
                  </li>
                ))}
              </ul>
            )}
            <CommentField label="Nuevo comentario" value={comment} onChange={setComment} />
          </div>
        </Modal>
      )}
    </div>
  )
}

function countFor(counts: Record<RequestStatus, number>, filter: RequestFilter): number {
  if (filter === 'todas') return counts.pendiente + counts.aprobada + counts.rechazada
  return counts[filter]
}

interface CommentFieldProps {
  readonly label: string
  readonly value: string
  readonly onChange: (value: string) => void
}

function CommentField({ label, value, onChange }: CommentFieldProps) {
  return (
    <>
      <label className="label" htmlFor="dialog-comment">
        {label}
      </label>
      <textarea
        id="dialog-comment"
        className="field"
        rows={4}
        autoFocus
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </>
  )
}

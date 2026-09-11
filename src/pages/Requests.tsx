import { useMemo, useState } from 'react'
import type { IsoDate, RequestStatus } from '../domain/types'
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

export function Requests() {
  const { database, currentUser, year, apply, notify } = useSession()
  const [filter, setFilter] = useState<RequestFilter>('pendiente')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [comment, setComment] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [openThreads, setOpenThreads] = useState<Set<string>>(new Set())

  const tabCounts = useMemo(
    () => countDaysByStatus(database.requests, year),
    [database.requests, year],
  )

  const groups = useMemo(
    () => groupRequestsByEmployee(database.requests, database.employees, year, filter),
    [database.requests, database.employees, year, filter],
  )

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
    setComment('')
    setDialog({
      kind: 'rechazar-seleccion',
      employeeId: group.employee.id,
      employeeName: displayName(group.employee),
      selections,
    })
  }

  const openDialog = (kind: 'rechazar' | 'comentar', requestId: string, day: IsoDate) => {
    setComment('')
    setDialog({ kind, requestId, day })
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
              openThreads={openThreads}
              onToggleCollapsed={() =>
                setCollapsed((current) => toggleInSet(current, group.employee.id))
              }
              onToggleSelectAll={() => toggleSelectAll(group)}
              onToggleSelected={(requestId, day) =>
                setSelected((current) => toggleInSet(current, rowKey(requestId, day)))
              }
              onToggleThread={(requestId, day) =>
                setOpenThreads((current) => toggleInSet(current, rowKey(requestId, day)))
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
              onComment={(requestId, day) => openDialog('comentar', requestId, day)}
              onReject={(requestId, day) => openDialog('rechazar', requestId, day)}
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
          <CommentField
            label="Motivo (opcional, se aplica a todos los días seleccionados)"
            value={comment}
            onChange={setComment}
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
          <CommentField
            label={dialog.kind === 'rechazar' ? 'Motivo (opcional)' : 'Comentario'}
            value={comment}
            onChange={setComment}
          />
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

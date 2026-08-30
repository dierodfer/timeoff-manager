import { useMemo, useState } from 'react'
import type { RequestStatus } from '../domain/types'
import { addRequestComment, displayName, removeRequest, resolveRequest } from '../state/actions'
import { useSession } from '../state/AppStore'
import { Modal } from '../ui/Modal'
import { RequestCard } from '../ui/RequestCard'

type Filter = RequestStatus | 'todas'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'aprobada', label: 'Aprobadas' },
  { value: 'rechazada', label: 'Rechazadas' },
  { value: 'todas', label: 'Todas' },
]

type Dialog =
  | { kind: 'rechazar'; requestId: string }
  | { kind: 'comentar'; requestId: string }
  | null

export function Requests() {
  const { database, currentUser, year, apply, notify } = useSession()
  const [filter, setFilter] = useState<Filter>('pendiente')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [comment, setComment] = useState('')

  const names = useMemo(
    () => new Map(database.employees.map((employee) => [employee.id, displayName(employee)])),
    [database.employees],
  )

  const visible = useMemo(
    () =>
      database.requests
        .filter((request) => request.year === year)
        .filter((request) => filter === 'todas' || request.status === filter)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [database.requests, year, filter],
  )

  const approve = (requestId: string) => {
    if (apply((db) => resolveRequest(db, requestId, 'aprobada', currentUser.id))) {
      notify('Solicitud aprobada.')
    }
  }

  const remove = (requestId: string) => {
    if (apply((db) => removeRequest(db, requestId, currentUser))) {
      notify('Solicitud eliminada.')
    }
  }

  const confirmDialog = () => {
    if (!dialog) return
    const ok =
      dialog.kind === 'rechazar'
        ? apply((db) =>
            resolveRequest(db, dialog.requestId, 'rechazada', currentUser.id, comment),
          )
        : apply((db) => addRequestComment(db, dialog.requestId, currentUser.id, comment))

    if (ok) {
      notify(dialog.kind === 'rechazar' ? 'Solicitud rechazada.' : 'Comentario añadido.')
      setDialog(null)
      setComment('')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl">Solicitudes {year}</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Aprueba o rechaza las peticiones del equipo. Al rechazar puedes explicar el motivo.
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

      {visible.length === 0 ? (
        <p className="card p-6 text-sm text-[var(--color-ink-muted)]">
          No hay solicitudes que mostrar con este filtro.
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {visible.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              employeeName={names.get(request.employeeId) ?? 'Empleado eliminado'}
              actions={
                <>
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm"
                    onClick={() => {
                      setComment('')
                      setDialog({ kind: 'comentar', requestId: request.id })
                    }}
                  >
                    Comentar
                  </button>

                  {request.status === 'pendiente' ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => {
                          setComment('')
                          setDialog({ kind: 'rechazar', requestId: request.id })
                        }}
                      >
                        Rechazar
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => approve(request.id)}
                      >
                        Aprobar
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => remove(request.id)}
                    >
                      Eliminar
                    </button>
                  )}
                </>
              }
            />
          ))}
        </div>
      )}

      {dialog && (
        <Modal
          title={dialog.kind === 'rechazar' ? 'Rechazar solicitud' : 'Añadir comentario'}
          description={
            dialog.kind === 'rechazar'
              ? 'Los días vuelven al saldo del empleado.'
              : undefined
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

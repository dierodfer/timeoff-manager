import { ChevronLeft } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { requestsOf } from '../domain/balance'
import { displayName, removeRequest } from '../state/actions'
import { useSession } from '../state/appContext'
import { RequestCard } from '../ui/RequestCard'

export function MyRequests() {
  const { database, currentUser, year, apply, notify } = useSession()
  const [params] = useSearchParams()
  const isAdmin = currentUser.role === 'admin'

  // Un administrador llega aquí desde el calendario de otra persona: conserva a quién mira.
  const viewed =
    (isAdmin && database.employees.find((employee) => employee.id === params.get('empleado'))) ||
    currentUser
  const viewingSelf = viewed.id === currentUser.id

  const requests = useMemo(
    () =>
      [...requestsOf(database.requests, viewed.id, year)].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      ),
    [database.requests, viewed.id, year],
  )

  const cancel = (requestId: string) => {
    if (apply((db) => removeRequest(db, requestId, currentUser))) {
      notify(viewingSelf ? 'Solicitud cancelada.' : 'Solicitud eliminada.')
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <Link
          to={viewingSelf ? '/' : `/?empleado=${viewed.id}`}
          className="inline-flex items-center gap-1 text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
        >
          <ChevronLeft className="size-4" />
          Mi calendario
        </Link>
        <h1 className="mt-2 text-2xl">
          {viewingSelf ? 'Mis solicitudes' : `Solicitudes de ${displayName(viewed)}`} {year}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          {requests.length === 0
            ? 'Aquí aparecen las vacaciones solicitadas y su estado.'
            : `${requests.length} ${requests.length === 1 ? 'solicitud' : 'solicitudes'} en ${year}.`}
        </p>
      </div>

      {requests.length === 0 ? (
        <p className="card p-6 text-sm text-[var(--color-ink-muted)]">
          {viewingSelf
            ? 'Todavía no has solicitado vacaciones este año.'
            : 'Sin vacaciones solicitadas este año.'}
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {requests.map((request) => (
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
    </div>
  )
}

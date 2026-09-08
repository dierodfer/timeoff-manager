import { ChevronLeft } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { requestsOf } from '../domain/balance'
import type { IsoDate } from '../domain/types'
import { displayName, removeRequestDays } from '../state/actions'
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

  const cancelRange = (requestId: string, days: IsoDate[]) => {
    if (apply((db) => removeRequestDays(db, requestId, days, currentUser))) {
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
              canCancel={request.status === 'pendiente' || isAdmin}
              cancelLabel={request.status === 'pendiente' ? 'Cancelar' : 'Eliminar'}
              onCancelRange={(days) => cancelRange(request.id, days)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

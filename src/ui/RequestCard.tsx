import type { ReactNode } from 'react'
import { formatDate } from '../domain/format'
import type { VacationRequest } from '../domain/types'
import { STATUS_LABEL, summarizeDays } from './calendarGrid'

interface RequestCardProps {
  readonly request: VacationRequest
  readonly employeeName?: string
  readonly actions?: ReactNode
}

export function RequestCard({ request, employeeName, actions }: RequestCardProps) {
  return (
    <article className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {employeeName && <p className="text-sm font-semibold">{employeeName}</p>}
          <p className="text-sm text-[var(--color-ink-soft)]">{summarizeDays(request.days)}</p>
          <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
            {request.days.length} {request.days.length === 1 ? 'día' : 'días'} · {request.year} ·
            solicitada el {formatDate(request.createdAt)}
            {request.batchId ? ' · asignación masiva' : ''}
          </p>
        </div>

        <span className={`chip chip-${request.status}`}>{STATUS_LABEL[request.status]}</span>
      </div>

      {request.comments.length > 0 && (
        <ul className="hairline mt-3 space-y-2 border-t pt-3">
          {request.comments.map((comment) => (
            <li key={comment.id} className="text-sm">
              <span className="font-medium">{comment.authorName}</span>{' '}
              <span className="text-[var(--color-ink-muted)]">
                · {formatDate(comment.createdAt)}
              </span>
              <p className="text-[var(--color-ink-soft)]">{comment.text}</p>
            </li>
          ))}
        </ul>
      )}

      {actions && <div className="mt-3 flex flex-wrap justify-end gap-2">{actions}</div>}
    </article>
  )
}

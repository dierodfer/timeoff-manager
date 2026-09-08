import { formatDate } from '../domain/format'
import type { IsoDate, VacationRequest } from '../domain/types'
import { dayRanges, formatDayRange, STATUS_LABEL } from './calendarGrid'

interface RequestCardProps {
  readonly request: VacationRequest
  readonly employeeName?: string
  readonly canCancel: boolean
  readonly cancelLabel: string
  readonly onCancelRange: (days: IsoDate[]) => void
}

export function RequestCard({
  request,
  employeeName,
  canCancel,
  cancelLabel,
  onCancelRange,
}: RequestCardProps) {
  return (
    <article className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {employeeName && <p className="text-sm font-semibold">{employeeName}</p>}
          <p className="text-xs text-[var(--color-ink-muted)]">
            {request.days.length} {request.days.length === 1 ? 'día' : 'días'} · {request.year} ·
            solicitada el {formatDate(request.createdAt)}
            {request.batchId ? ' · asignación masiva' : ''}
          </p>
        </div>

        <span className={`chip chip-${request.status}`}>{STATUS_LABEL[request.status]}</span>
      </div>

      <ul className="hairline mt-3 divide-y divide-[var(--color-hairline)] border-t">
        {dayRanges(request.days).map((range) => (
          <li key={range[0]} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span>{formatDayRange(range)}</span>
            {canCancel && (
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => onCancelRange(range)}
              >
                {cancelLabel}
              </button>
            )}
          </li>
        ))}
      </ul>

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
    </article>
  )
}

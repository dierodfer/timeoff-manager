import { Check, MessageSquare, Trash2, X } from 'lucide-react'
import { formatDate, formatWeekday } from '../domain/format'
import { STATUS_LABEL } from './calendarGrid'
import type { DayRow } from './requestGroups'

interface RequestDayRowProps {
  readonly row: DayRow
  readonly isSelected: boolean
  readonly onToggleSelected: () => void
  readonly onComment: () => void
  readonly onReject: () => void
  readonly onApprove: () => void
  readonly onRemove: () => void
}

export function RequestDayRow({
  row,
  isSelected,
  onToggleSelected,
  onComment,
  onReject,
  onApprove,
  onRemove,
}: RequestDayRowProps) {
  const isPending = row.status === 'pendiente'

  return (
    <tr className="hover:bg-[var(--color-surface-sunken)]/40">
      <td className="px-5 py-3 align-top">
        {isPending && (
          <input
            type="checkbox"
            aria-label={`Seleccionar el ${formatDate(row.day)}`}
            checked={isSelected}
            onChange={onToggleSelected}
          />
        )}
      </td>
      <td className="px-2 py-3 align-top">
        <p className="tabular text-[var(--color-ink-soft)]">{formatDate(row.day)}</p>
        <p className="text-xs text-[var(--color-ink-muted)]">{formatWeekday(row.day)}</p>
      </td>
      <td className="px-2 py-3 align-top">
        <span className={`chip chip-${row.status}`}>{STATUS_LABEL[row.status]}</span>
      </td>
      <td className="px-5 py-3 align-top">
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="btn btn-secondary btn-sm relative"
            aria-label={
              row.comments.length > 0 ? `Comentarios (${row.comments.length})` : 'Comentar'
            }
            onClick={onComment}
          >
            <MessageSquare className="size-3.5" />
            {row.comments.length > 0 && (
              <span className="notification-dot tabular">{row.comments.length}</span>
            )}
          </button>

          {isPending ? (
            <>
              <button type="button" className="btn btn-danger btn-sm" onClick={onReject}>
                <X className="size-3.5" />
                Rechazar
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={onApprove}>
                <Check className="size-3.5" />
                Aprobar
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-danger btn-sm" onClick={onRemove}>
              <Trash2 className="size-3.5" />
              Eliminar
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

import { Check, ChevronDown, ChevronUp, MessageSquare, Trash2, X } from 'lucide-react'
import { Fragment } from 'react'
import { formatDate, formatWeekdayShort } from '../domain/format'
import { STATUS_LABEL } from './calendarGrid'
import type { DayRow } from './requestGroups'

interface RequestDayRowProps {
  readonly row: DayRow
  readonly isSelected: boolean
  readonly isThreadOpen: boolean
  readonly onToggleSelected: () => void
  readonly onToggleThread: () => void
  readonly onComment: () => void
  readonly onReject: () => void
  readonly onApprove: () => void
  readonly onRemove: () => void
}

export function RequestDayRow({
  row,
  isSelected,
  isThreadOpen,
  onToggleSelected,
  onToggleThread,
  onComment,
  onReject,
  onApprove,
  onRemove,
}: RequestDayRowProps) {
  const isPending = row.status === 'pendiente'

  return (
    <Fragment>
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
          <p className="text-xs text-[var(--color-ink-muted)]">{formatWeekdayShort(row.day)}</p>
        </td>
        <td className="px-2 py-3 align-top">
          <span className={`chip chip-${row.status}`}>{STATUS_LABEL[row.status]}</span>
        </td>
        <td className="max-w-0 px-2 py-3 align-top">
          {row.comments.length === 0 ? (
            <span className="text-xs text-[var(--color-ink-muted)]">—</span>
          ) : (
            <button
              type="button"
              className="flex w-full items-center gap-1 text-left text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              onClick={onToggleThread}
            >
              <span className="min-w-0 flex-1 truncate">{row.comments.at(-1)?.text}</span>
              {row.comments.length > 1 && (
                <span className="tabular shrink-0">+{row.comments.length - 1}</span>
              )}
              {isThreadOpen ? (
                <ChevronUp className="size-3.5 shrink-0" />
              ) : (
                <ChevronDown className="size-3.5 shrink-0" />
              )}
            </button>
          )}
        </td>
        <td className="px-2 py-3 align-top text-xs text-[var(--color-ink-muted)]">1 día</td>
        <td className="px-5 py-3 align-top">
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secondary btn-sm" onClick={onComment}>
              <MessageSquare className="size-3.5" />
              Comentar
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

      {isThreadOpen && row.comments.length > 0 && (
        <tr>
          <td colSpan={6} className="space-y-2 bg-[var(--color-surface-sunken)] px-5 py-3">
            {row.comments.map((item) => (
              <p key={item.id} className="text-xs">
                <span className="font-medium text-[var(--color-ink)]">{item.authorName}</span>{' '}
                <span className="text-[var(--color-ink-muted)]">
                  · {formatDate(item.createdAt)}
                </span>
                <br />
                <span className="text-[var(--color-ink-soft)]">{item.text}</span>
              </p>
            ))}
          </td>
        </tr>
      )}
    </Fragment>
  )
}

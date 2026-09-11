import { Check, CheckCheck, ChevronDown, ChevronUp, X } from 'lucide-react'
import { pluralDays } from '../domain/format'
import type { IsoDate } from '../domain/types'
import { displayName } from '../state/actions'
import { Avatar } from './Avatar'
import { RequestDayRow } from './RequestDayRow'
import { pendingKeysOf, rowKey, selectionOf, type EmployeeGroup } from './requestGroups'

interface RequestGroupCardProps {
  readonly group: EmployeeGroup
  readonly isCollapsed: boolean
  readonly selected: ReadonlySet<string>
  readonly openThreads: ReadonlySet<string>
  readonly onToggleCollapsed: () => void
  readonly onToggleSelectAll: () => void
  readonly onToggleSelected: (requestId: string, day: IsoDate) => void
  readonly onToggleThread: (requestId: string, day: IsoDate) => void
  readonly onApproveSelected: () => void
  readonly onRejectSelected: () => void
  readonly onClearSelection: () => void
  readonly onApproveAll: () => void
  readonly onComment: (requestId: string, day: IsoDate) => void
  readonly onReject: (requestId: string, day: IsoDate) => void
  readonly onApprove: (requestId: string, day: IsoDate) => void
  readonly onRemove: (requestId: string, day: IsoDate) => void
}

export function RequestGroupCard({
  group,
  isCollapsed,
  selected,
  openThreads,
  onToggleCollapsed,
  onToggleSelectAll,
  onToggleSelected,
  onToggleThread,
  onApproveSelected,
  onRejectSelected,
  onClearSelection,
  onApproveAll,
  onComment,
  onReject,
  onApprove,
  onRemove,
}: RequestGroupCardProps) {
  const nombre = displayName(group.employee)
  const pendingKeys = pendingKeysOf(group)
  const selectionCount = selectionOf(group, selected).length
  const allSelected = pendingKeys.length > 0 && selectionCount === pendingKeys.length

  return (
    <section className="card overflow-hidden">
      <div className="hairline flex flex-wrap items-center justify-between gap-3 border-b bg-[var(--color-surface-sunken)] px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar employee={group.employee} size="lg" />
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold">{nombre}</h2>
            <p className="text-xs text-[var(--color-ink-muted)]">
              {group.requestCount} {group.requestCount === 1 ? 'solicitud' : 'solicitudes'} ·{' '}
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
              <button type="button" className="btn btn-primary btn-sm" onClick={onApproveSelected}>
                <Check className="size-4" />
                Aprobar seleccionados
              </button>
              <button type="button" className="btn btn-danger btn-sm" onClick={onRejectSelected}>
                <X className="size-4" />
                Rechazar seleccionados
              </button>
              <button type="button" className="btn btn-quiet btn-sm" onClick={onClearSelection}>
                Cancelar
              </button>
            </>
          ) : (
            group.pendingCount > 0 && (
              <button type="button" className="btn btn-primary btn-sm" onClick={onApproveAll}>
                <CheckCheck className="size-4" />
                Aprobar todos ({group.pendingCount})
              </button>
            )
          )}

          <button
            type="button"
            className="icon-btn"
            aria-label={isCollapsed ? `Expandir ${nombre}` : `Contraer ${nombre}`}
            onClick={onToggleCollapsed}
          >
            {isCollapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
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
                    aria-label={`Seleccionar todos los días pendientes de ${nombre}`}
                    checked={allSelected}
                    disabled={pendingKeys.length === 0}
                    ref={(element) => {
                      if (element) element.indeterminate = selectionCount > 0 && !allSelected
                    }}
                    onChange={onToggleSelectAll}
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
                return (
                  <RequestDayRow
                    key={key}
                    row={row}
                    isSelected={selected.has(key)}
                    isThreadOpen={openThreads.has(key)}
                    onToggleSelected={() => onToggleSelected(row.requestId, row.day)}
                    onToggleThread={() => onToggleThread(row.requestId, row.day)}
                    onComment={() => onComment(row.requestId, row.day)}
                    onReject={() => onReject(row.requestId, row.day)}
                    onApprove={() => onApprove(row.requestId, row.day)}
                    onRemove={() => onRemove(row.requestId, row.day)}
                  />
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

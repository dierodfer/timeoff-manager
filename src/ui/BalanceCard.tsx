import { ListChecks, Send } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Balance } from '../domain/balance'
import { formatDays, truncateDays } from '../domain/format'
import { Metric } from './Metric'

interface BalanceCardProps {
  readonly balance: Balance
  readonly onRequest?: () => void
  readonly requestDisabled?: boolean
  readonly requestsTo?: string
}

export function BalanceCard({ balance, onRequest, requestDisabled, requestsTo }: BalanceCardProps) {
  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Días de vacaciones {balance.year}</h2>
        {balance.isOverridden && (
          <span className="chip chip-neutral">
            Ajustado · estimación {formatDays(balance.estimated)}
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Metric label="Asignados" value={truncateDays(balance.assigned)} />
        <Metric label="Aprobados" value={balance.approved} tone="var(--color-approved)" />
        <Metric label="Pendientes" value={balance.pending} tone="var(--color-pending)" />
        <Metric
          label="Disponibles"
          value={truncateDays(balance.available)}
          tone="var(--color-accent)"
        />
      </div>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-sunken)]">
        <div className="flex h-full">
          <span
            className="h-full"
            style={{
              width: `${percentage(balance.approved, balance.assigned)}%`,
              background: 'var(--color-approved)',
            }}
          />
          <span
            className="h-full"
            style={{
              width: `${percentage(balance.pending, balance.assigned)}%`,
              background: 'var(--color-pending)',
            }}
          />
        </div>
      </div>

      {(onRequest || requestsTo) && (
        <div className="mt-4 space-y-2">
          {onRequest && (
            <button
              type="button"
              className="btn btn-primary w-full"
              disabled={requestDisabled}
              title={requestDisabled ? 'Selecciona antes los días en el calendario.' : undefined}
              onClick={onRequest}
            >
              <Send className="size-4" />
              Solicitar vacaciones
            </button>
          )}
          {requestsTo && (
            <Link to={requestsTo} className="btn btn-secondary w-full">
              <ListChecks className="size-4" />
              Ver mis solicitudes
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

function percentage(part: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(100, Math.round((part / total) * 100))
}

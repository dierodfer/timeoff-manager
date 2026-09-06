import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Balance } from '../domain/balance'
import { formatDays, truncateDays } from '../domain/format'
import { Metric } from './Metric'

interface BalanceCardProps {
  readonly balance: Balance
  /** Si se pasa, la tarjeta entera enlaza ahí: es la vía a las solicitudes desde Mi calendario. */
  readonly to?: string
  readonly linkLabel?: string
}

export function BalanceCard({ balance, to, linkLabel }: BalanceCardProps) {
  const content = (
    <>
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

      {to && (
        <p className="mt-4 flex items-center gap-1 text-xs font-medium text-[var(--color-accent)]">
          {linkLabel}
          <ChevronRight className="size-3.5" />
        </p>
      )}
    </>
  )

  return to ? (
    <Link to={to} className="card card-link block p-5">
      {content}
    </Link>
  ) : (
    <div className="card p-5">{content}</div>
  )
}

function percentage(part: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(100, Math.round((part / total) * 100))
}

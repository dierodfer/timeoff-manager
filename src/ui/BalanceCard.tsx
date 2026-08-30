import type { Balance } from '../domain/balance'

function Metric({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div>
      <p className="text-xs text-[var(--color-ink-muted)]">{label}</p>
      <p className="tabular mt-0.5 text-2xl font-semibold" style={tone ? { color: tone } : undefined}>
        {value}
      </p>
    </div>
  )
}

export function BalanceCard({ balance }: { balance: Balance }) {
  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Saldo {balance.year}</h2>
        <span className="chip chip-neutral">
          {balance.isOverridden ? `Ajustado · estimación ${balance.estimated}` : 'Estimación automática'}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Metric label="Asignados" value={balance.assigned} />
        <Metric label="Aprobados" value={balance.approved} tone="var(--color-approved)" />
        <Metric label="Pendientes" value={balance.pending} tone="var(--color-pending)" />
        <Metric label="Disponibles" value={balance.available} tone="var(--color-accent)" />
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
    </div>
  )
}

function percentage(part: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(100, Math.round((part / total) * 100))
}

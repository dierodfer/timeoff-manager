import type { ReactNode } from 'react'

interface MetricProps {
  readonly label: ReactNode
  readonly value: ReactNode
  readonly tone?: string
  /** `card` invierte el orden: cifra grande arriba y etiqueta debajo. */
  readonly layout?: 'label-first' | 'value-first'
}

export function Metric({ label, value, tone, layout = 'label-first' }: MetricProps) {
  const number = (
    <p className="tabular text-2xl font-semibold" style={tone ? { color: tone } : undefined}>
      {value}
    </p>
  )
  const text = <p className="text-xs text-[var(--color-ink-muted)]">{label}</p>

  return layout === 'value-first' ? (
    <div>
      {number}
      {text}
    </div>
  ) : (
    <div>
      {text}
      <div className="mt-0.5">{number}</div>
    </div>
  )
}

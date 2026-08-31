import { formatDays } from '../domain/format'

interface StepperProps {
  readonly value: number
  readonly onChange: (value: number) => void
  readonly min?: number
  readonly max?: number
  readonly label: string
}

export function Stepper({ value, onChange, min = 0, max = 366, label }: StepperProps) {
  // Un ajuste a mano siempre es entero: desde 11,64 el − lleva a 11 y el + a 12.
  const decrement = Math.max(min, Math.ceil(value - 1))
  const increment = Math.min(max, Math.floor(value + 1))

  return (
    <div
      className="hairline inline-flex items-center gap-1 rounded-full border bg-[var(--color-surface-sunken)] p-1"
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        aria-label={`Quitar un día a ${label}`}
        disabled={value <= min}
        onClick={() => onChange(decrement)}
        className="flex size-7 items-center justify-center rounded-full bg-[var(--color-surface)] text-lg leading-none text-[var(--color-ink)] shadow-sm transition disabled:opacity-35"
      >
        −
      </button>
      <span className="tabular w-12 text-center text-sm font-semibold">{formatDays(value)}</span>
      <button
        type="button"
        aria-label={`Añadir un día a ${label}`}
        disabled={value >= max}
        onClick={() => onChange(increment)}
        className="flex size-7 items-center justify-center rounded-full bg-[var(--color-surface)] text-lg leading-none text-[var(--color-ink)] shadow-sm transition disabled:opacity-35"
      >
        +
      </button>
    </div>
  )
}

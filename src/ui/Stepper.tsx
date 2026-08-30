interface StepperProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  label: string
}

export function Stepper({ value, onChange, min = 0, max = 366, label }: StepperProps) {
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
        onClick={() => onChange(value - 1)}
        className="flex size-7 items-center justify-center rounded-full bg-[var(--color-surface)] text-lg leading-none text-[var(--color-ink)] shadow-sm transition disabled:opacity-35"
      >
        −
      </button>
      <span className="tabular w-9 text-center text-sm font-semibold">{value}</span>
      <button
        type="button"
        aria-label={`Añadir un día a ${label}`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        className="flex size-7 items-center justify-center rounded-full bg-[var(--color-surface)] text-lg leading-none text-[var(--color-ink)] shadow-sm transition disabled:opacity-35"
      >
        +
      </button>
    </div>
  )
}

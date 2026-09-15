import { useCallback, useId, useRef, useState, type ReactNode } from 'react'
import { Metric } from './Metric'
import { useDismiss } from './useDismiss'

interface MetricInfoProps {
  readonly value: ReactNode
  readonly label: ReactNode
  readonly tone?: string
  readonly panelLabel: string
  readonly children: ReactNode
}

/** Metric que se pulsa para desplegar un detalle del cálculo, con el mismo patrón de
 * popover que RowMenu (useDismiss + click fuera/Escape). */
export function MetricInfo({ value, label, tone, panelLabel, children }: MetricInfoProps) {
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const id = useId()

  const isInside = useCallback(
    (target: HTMLElement) => Boolean(container.current?.contains(target)),
    [],
  )
  useDismiss(open, isInside, () => setOpen(false))

  return (
    <div className="relative" ref={container}>
      <button
        type="button"
        className="cursor-pointer text-left"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={panelLabel}
        onClick={() => setOpen((current) => !current)}
      >
        <Metric layout="value-first" value={value} label={label} tone={tone} />
      </button>

      {open && (
        <div id={id} role="dialog" aria-label={panelLabel} className="metric-tip">
          {children}
        </div>
      )}
    </div>
  )
}

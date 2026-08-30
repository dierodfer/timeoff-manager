import { useCallback, useRef, useState } from 'react'
import { expandRange } from '../domain/dates'
import type { IsoDate } from '../domain/types'

/**
 * Selección de días del calendario. Un clic alterna un día suelto; con la tecla
 * mayúsculas pulsada se selecciona el rango desde el último día marcado, que es
 * la forma natural de pedir unas vacaciones de varios días seguidos.
 */
export function useDaySelection(canSelect: (date: IsoDate) => boolean) {
  const [selected, setSelected] = useState<ReadonlySet<IsoDate>>(() => new Set())
  const anchor = useRef<IsoDate | null>(null)

  const toggle = useCallback(
    (date: IsoDate, extendRange = false) => {
      if (!canSelect(date)) return

      setSelected((current) => {
        const next = new Set(current)

        if (extendRange && anchor.current) {
          for (const day of expandRange(anchor.current, date)) {
            if (canSelect(day)) next.add(day)
          }
        } else if (next.has(date)) {
          next.delete(date)
        } else {
          next.add(date)
        }

        return next
      })

      anchor.current = date
    },
    [canSelect],
  )

  const clear = useCallback(() => {
    setSelected(new Set())
    anchor.current = null
  }, [])

  const selectRange = useCallback(
    (start: IsoDate, end: IsoDate) => {
      setSelected(new Set(expandRange(start, end).filter(canSelect)))
      anchor.current = end
    },
    [canSelect],
  )

  return { selected, toggle, clear, selectRange }
}

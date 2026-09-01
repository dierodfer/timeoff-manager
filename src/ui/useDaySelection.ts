import { useCallback, useRef, useState } from 'react'
import { expandRange } from '../domain/dates'
import type { IsoDate } from '../domain/types'

export interface SelectionLimit {
  max: number
  onExceeded: () => void
}

export function useDaySelection(canSelect: (date: IsoDate) => boolean, limit?: SelectionLimit) {
  const [selected, setSelected] = useState<ReadonlySet<IsoDate>>(() => new Set())
  const anchor = useRef<IsoDate | null>(null)

  const toggle = useCallback(
    (date: IsoDate, extendRange = false) => {
      if (!canSelect(date)) return

      // El ancla se lee antes de moverla: React ejecuta el actualizador de
      // estado más tarde, cuando el ref ya apuntaría al día recién pulsado.
      const from = anchor.current
      anchor.current = date

      const additions =
        extendRange && from
          ? expandRange(from, date).filter((day) => canSelect(day) && !selected.has(day))
          : selected.has(date)
            ? []
            : [date]

      if (limit && selected.size + additions.length > limit.max + 1e-9) {
        limit.onExceeded()
        return
      }

      setSelected((current) => {
        if (extendRange && from) return new Set([...current, ...additions])
        const next = new Set(current)
        if (next.has(date)) next.delete(date)
        else next.add(date)
        return next
      })
    },
    [canSelect, selected, limit],
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

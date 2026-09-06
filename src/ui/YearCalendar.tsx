import { useCallback, useState } from 'react'
import type { IsoDate } from '../domain/types'
import type { WorkCalendar } from '../domain/workdays'
import { MonthCalendar, type DayMark } from './MonthCalendar'
import { useDismiss } from './useDismiss'

interface YearCalendarProps {
  readonly year: number
  readonly calendar: WorkCalendar
  readonly markOf: (date: IsoDate) => DayMark
  readonly selected: ReadonlySet<IsoDate>
  readonly today: IsoDate
  readonly onToggle?: (date: IsoDate, extendRange: boolean) => void
}

export function YearCalendar({ onToggle, ...props }: YearCalendarProps) {
  const [infoDay, setInfoDay] = useState<IsoDate | null>(null)

  const isInside = useCallback(
    (target: HTMLElement) => Boolean(target.closest('[data-day-info]')),
    [],
  )
  useDismiss(infoDay !== null, isInside, () => setInfoDay(null))

  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 12 }, (_, index) => (
        <MonthCalendar
          key={index}
          month={index + 1}
          {...props}
          infoDay={infoDay}
          onInfo={setInfoDay}
          onToggle={
            onToggle &&
            ((date, extendRange) => {
              setInfoDay(null)
              onToggle(date, extendRange)
            })
          }
        />
      ))}
    </div>
  )
}

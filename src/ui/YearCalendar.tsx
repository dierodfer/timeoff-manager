import { useEffect, useState } from 'react'
import type { IsoDate } from '../domain/types'
import type { WorkCalendar } from '../domain/workdays'
import { MonthCalendar, type DayMark } from './MonthCalendar'

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

  useEffect(() => {
    if (!infoDay) return

    const closeOnOutsideClick = (event: MouseEvent) => {
      if ((event.target as HTMLElement).closest('[data-day-info]')) return
      setInfoDay(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // Escape consumido para que no burbujee hasta el Modal, que también cierra con Escape.
      event.preventDefault()
      setInfoDay(null)
    }

    document.addEventListener('click', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('click', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [infoDay])

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

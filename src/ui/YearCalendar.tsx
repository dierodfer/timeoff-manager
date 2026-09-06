import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useCallback, useState } from 'react'
import type { IsoDate } from '../domain/types'
import type { WorkCalendar } from '../domain/workdays'
import { MONTH_NAMES } from './calendarGrid'
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

  const handleToggle =
    onToggle &&
    ((date: IsoDate, extendRange: boolean) => {
      setInfoDay(null)
      onToggle(date, extendRange)
    })

  return (
    <div>
      {/* key={year}: remonta al cambiar de año para que el mes mostrado vuelva a partir del de
          hoy, sin sincronizarlo con un efecto. */}
      <MobileMonth
        key={props.year}
        {...props}
        infoDay={infoDay}
        onInfo={setInfoDay}
        onToggle={handleToggle}
      />

      <div className="hidden gap-x-6 gap-y-7 sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 12 }, (_, index) => (
          <MonthCalendar
            key={index}
            month={index + 1}
            {...props}
            infoDay={infoDay}
            onInfo={setInfoDay}
            onToggle={handleToggle}
          />
        ))}
      </div>
    </div>
  )
}

interface MobileMonthProps {
  readonly year: number
  readonly calendar: WorkCalendar
  readonly markOf: (date: IsoDate) => DayMark
  readonly selected: ReadonlySet<IsoDate>
  readonly today: IsoDate
  readonly onToggle?: (date: IsoDate, extendRange: boolean) => void
  readonly infoDay: IsoDate | null
  readonly onInfo: (date: IsoDate | null) => void
}

function MobileMonth({ year, today, ...props }: MobileMonthProps) {
  const todayMonth = today.startsWith(`${year}-`) ? Number(today.slice(5, 7)) : 1
  const [month, setMonth] = useState(todayMonth)

  return (
    <div className="sm:hidden">
      <div className="year-picker mb-3 justify-center">
        <button
          type="button"
          aria-label="Mes anterior"
          disabled={month === 1}
          onClick={() => setMonth((current) => current - 1)}
        >
          <ChevronLeft className="size-4" />
        </button>
        <span>{MONTH_NAMES[month - 1]}</span>
        <button
          type="button"
          aria-label="Mes siguiente"
          disabled={month === 12}
          onClick={() => setMonth((current) => current + 1)}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <MonthCalendar month={month} year={year} today={today} {...props} hideTitle />
    </div>
  )
}

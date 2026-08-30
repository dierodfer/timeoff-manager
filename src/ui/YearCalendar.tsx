import type { IsoDate } from '../domain/types'
import type { WorkCalendar } from '../domain/workdays'
import { MonthCalendar, type DayMark } from './MonthCalendar'

interface YearCalendarProps {
  year: number
  calendar: WorkCalendar
  markOf: (date: IsoDate) => DayMark
  selected: ReadonlySet<IsoDate>
  today: IsoDate
  onToggle?: (date: IsoDate, extendRange: boolean) => void
}

/** Los doce meses del año a la vez: la vista con la que el empleado planifica. */
export function YearCalendar(props: YearCalendarProps) {
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 12 }, (_, index) => (
        <MonthCalendar key={index} month={index + 1} {...props} />
      ))}
    </div>
  )
}

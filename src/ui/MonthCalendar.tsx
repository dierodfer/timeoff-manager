import type { IsoDate } from '../domain/types'
import { dayOf } from '../domain/dates'
import { holidayOn, isWorkingDay, type WorkCalendar } from '../domain/workdays'
import {
  MONTH_DAY_CLASS,
  MONTH_NAMES,
  WEEK_COLUMNS,
  columnOf,
  dayInfo,
  dayState,
  dayTitle,
  firstDayOffset,
  formatLongDate,
  monthCells,
} from './calendarGrid'

export type DayMark = 'aprobada' | 'pendiente' | undefined

function tipAlignment(date: IsoDate): string {
  const column = columnOf(date)
  if (column <= 1) return 'day-tip-start'
  if (column >= 5) return 'day-tip-end'
  return ''
}

interface MonthCalendarProps {
  readonly year: number
  readonly month: number
  readonly calendar: WorkCalendar
  readonly markOf: (date: IsoDate) => DayMark
  readonly selected: ReadonlySet<IsoDate>
  readonly today: IsoDate
  readonly onToggle?: (date: IsoDate, extendRange: boolean) => void
  readonly infoDay?: IsoDate | null
  readonly onInfo?: (date: IsoDate | null) => void
}

export function MonthCalendar({
  year,
  month,
  calendar,
  markOf,
  selected,
  today,
  onToggle,
  infoDay,
  onInfo,
}: MonthCalendarProps) {
  const cells = monthCells(year, month)

  return (
    <section className="min-w-0">
      <h3 className="mb-2 px-1 text-sm font-semibold">{MONTH_NAMES[month - 1]}</h3>

      <div className="mb-1 grid grid-cols-7 gap-1 px-1">
        {WEEK_COLUMNS.map((label, index) => (
          <span
            key={label}
            className={`text-center text-[11px] font-medium ${
              index === 6 ? 'text-[var(--color-ink-muted)]/60' : 'text-[var(--color-ink-muted)]'
            }`}
          >
            {label}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 px-1">
        {cells.map((date, index) => {
          const holiday = holidayOn(calendar, date)
          const workable = isWorkingDay(calendar, date)
          const mark = markOf(date)
          const isSelected = selected.has(date)

          const state = dayState({
            isSelected,
            mark,
            isHoliday: Boolean(holiday),
            isWorkable: workable,
          })
          const classes = ['day', 'aspect-square', MONTH_DAY_CLASS[state]]
          if (date === today) classes.push('day-today')

          const title = dayTitle(holiday, mark)
          const style = index === 0 ? firstDayOffset(date) : undefined

          // Un día no laborable no se puede seleccionar, pero sí explicar: al pulsarlo abre un
          // globo con el nombre del festivo o el motivo. El `title` nativo no vale porque en un
          // móvil no hay puntero con el que pasar por encima.
          if (!workable && onInfo) {
            const info = dayInfo(date, holiday)
            const isOpen = infoDay === date

            return (
              <button
                key={date}
                type="button"
                data-day-info
                style={style}
                aria-label={`${formatLongDate(date)}: ${info.title}`}
                aria-expanded={isOpen}
                onClick={() => onInfo(isOpen ? null : date)}
                className={`${classes.join(' ')} cursor-help`}
              >
                {dayOf(date)}
                {isOpen && (
                  <span className={`day-tip ${tipAlignment(date)}`} role="tooltip">
                    <span className="font-semibold">{info.title}</span>
                    <span className="opacity-70">{info.detail}</span>
                  </span>
                )}
              </button>
            )
          }

          if (!onToggle || !workable) {
            return (
              <span key={date} className={classes.join(' ')} title={title} style={style}>
                {dayOf(date)}
              </span>
            )
          }

          return (
            <button
              key={date}
              type="button"
              title={title}
              style={style}
              aria-label={formatLongDate(date)}
              aria-pressed={isSelected}
              onClick={(event) => onToggle(date, event.shiftKey)}
              className={`${classes.join(' ')} cursor-pointer hover:brightness-95`}
            >
              {dayOf(date)}
            </button>
          )
        })}
      </div>
    </section>
  )
}

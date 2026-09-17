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

export interface DayAction {
  label: string
  onClick: () => void
}

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
  /** Cancelar/eliminar la solicitud de un día, cuando el usuario actual puede hacerlo. */
  readonly actionOf?: (date: IsoDate) => DayAction | undefined
  /** La rejilla de un solo mes en móvil pinta su propio nombre en el selector de encima. */
  readonly hideTitle?: boolean
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
  actionOf,
  hideTitle,
}: MonthCalendarProps) {
  const cells = monthCells(year, month)

  return (
    <section className="min-w-0">
      {!hideTitle && <h3 className="mb-2 px-1 text-sm font-semibold">{MONTH_NAMES[month - 1]}</h3>}

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
          // Un día ya aprobado o pendiente no se puede volver a seleccionar, igual que uno no
          // laborable: los dos se pintan con el mismo globo informativo en vez de dejarse pulsar.
          const blocked = !workable || Boolean(mark)

          if (blocked && onInfo) {
            const info = dayInfo(date, holiday, mark)
            const isOpen = infoDay === date
            const action = actionOf?.(date)

            // Envuelve en un <div>, no en el propio <button>: el botón de cancelar del globo es
            // otro <button>, y el HTML no admite uno anidado dentro de otro.
            return (
              <div key={date} data-day-info style={style} className="relative">
                <button
                  type="button"
                  aria-label={`${formatLongDate(date)}: ${info.title}`}
                  aria-expanded={isOpen}
                  onClick={() => onInfo(isOpen ? null : date)}
                  className={`${classes.join(' ')} w-full cursor-pointer`}
                >
                  {dayOf(date)}
                </button>
                {isOpen && (
                  <span className={`day-tip ${tipAlignment(date)}`} role="tooltip">
                    <span className="font-semibold">{info.title}</span>
                    <span className="opacity-70">{info.detail}</span>
                    {action && (
                      <button
                        type="button"
                        className="btn btn-danger btn-sm pointer-events-auto mt-1"
                        onClick={() => {
                          onInfo(null)
                          action.onClick()
                        }}
                      >
                        {action.label}
                      </button>
                    )}
                  </span>
                )}
              </div>
            )
          }

          if (!onToggle || blocked) {
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

import { useRef } from 'react'
import { dayOf, daysInMonth, monthOf, weekday } from '../domain/dates'
import type { Employee, IsoDate } from '../domain/types'
import { holidayOn, isWorkingDay, WEEKDAY_LABELS, type WorkCalendar } from '../domain/workdays'
import { GRID_DAY_CLASS, MONTH_NAMES, dayState, yearDays } from './calendarGrid'
import type { DayMark } from './MonthCalendar'

interface YearGridProps {
  readonly year: number
  readonly employees: Employee[]
  readonly calendar: WorkCalendar
  readonly markOf: (employeeId: string, date: IsoDate) => DayMark
  readonly selectedEmployeeId: string | null
  readonly selected: ReadonlySet<IsoDate>
  readonly today: IsoDate
  readonly onToggle: (employeeId: string, date: IsoDate, extendRange: boolean) => void
}

export function YearGrid({
  year,
  employees,
  calendar,
  markOf,
  selectedEmployeeId,
  selected,
  today,
  onToggle,
}: YearGridProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const days = yearDays(year)

  const scrollToMonth = (month: number) => {
    const target = scroller.current?.querySelector<HTMLElement>(`[data-month-start="${month}"]`)
    if (!target || !scroller.current) return
    scroller.current.scrollTo({ left: Math.max(0, target.offsetLeft - 200), behavior: 'smooth' })
  }

  return (
    <div className="card overflow-hidden">
      <div className="hairline flex flex-wrap gap-1 border-b px-3 py-2">
        {MONTH_NAMES.map((name, index) => (
          <button
            key={name}
            type="button"
            onClick={() => scrollToMonth(index + 1)}
            className="btn btn-quiet btn-sm"
          >
            {name.slice(0, 3)}
          </button>
        ))}
      </div>

      <div ref={scroller} className="overflow-x-auto">
        <table className="border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 w-48 min-w-48 bg-[var(--color-surface)] px-3 py-2 text-left text-xs font-medium text-[var(--color-ink-muted)]">
                Empleado
              </th>
              {Array.from({ length: 12 }, (_, index) => (
                <th
                  key={index}
                  colSpan={daysInMonth(year, index + 1)}
                  className="hairline border-l bg-[var(--color-surface)] px-2 py-2 text-left text-xs font-semibold"
                >
                  {MONTH_NAMES[index]}
                </th>
              ))}
            </tr>
            <tr>
              <th className="sticky left-0 z-20 bg-[var(--color-surface)]" />
              {days.map((date) => {
                const isSunday = weekday(date) === 0
                return (
                  <th
                    key={date}
                    data-month-start={dayOf(date) === 1 ? monthOf(date) : undefined}
                    className={`w-[19px] min-w-[19px] pb-1 text-center text-[10px] font-normal ${
                      dayOf(date) === 1 ? 'hairline border-l' : ''
                    } ${isSunday ? 'text-[var(--color-ink-muted)]/50' : 'text-[var(--color-ink-muted)]'}`}
                  >
                    {WEEKDAY_LABELS[weekday(date)]}
                  </th>
                )
              })}
            </tr>
          </thead>

          <tbody>
            {employees.map((employee) => {
              const isActiveRow = employee.id === selectedEmployeeId
              return (
                <tr key={employee.id} className="group">
                  <th
                    scope="row"
                    className={`hairline sticky left-0 z-10 border-t bg-[var(--color-surface)] px-3 py-1 text-left text-[13px] font-medium ${
                      isActiveRow ? 'text-[var(--color-accent)]' : ''
                    }`}
                  >
                    <span className="block truncate">
                      {employee.firstName} {employee.lastName}
                    </span>
                  </th>

                  {days.map((date) => {
                    const holiday = holidayOn(calendar, date)
                    const workable = isWorkingDay(calendar, date)
                    const mark = markOf(employee.id, date)
                    const isSelected = isActiveRow && selected.has(date)

                    const state = dayState({
                      isSelected,
                      mark,
                      isHoliday: Boolean(holiday),
                      isWorkable: workable,
                    })

                    return (
                      <td
                        key={date}
                        className={`hairline border-t p-0 ${
                          dayOf(date) === 1
                            ? 'border-l border-l-[var(--color-hairline-strong)]'
                            : ''
                        }`}
                      >
                        <button
                          type="button"
                          disabled={!workable}
                          onClick={(event) => onToggle(employee.id, date, event.shiftKey)}
                          title={holiday ? holiday.name : date}
                          aria-label={`${employee.firstName} ${employee.lastName}, ${date}`}
                          className={`grid-day ${GRID_DAY_CLASS[state]} ${
                            workable ? 'cursor-pointer hover:brightness-90' : 'cursor-default'
                          } ${date === today ? 'ring-1 ring-inset ring-[var(--color-accent)]' : ''}`}
                        />
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

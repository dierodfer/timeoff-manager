import { useState } from 'react'
import { dayOf, monthOf, todayIso, yearOf } from '../domain/dates'
import type { IsoDate } from '../domain/types'
import { holidayOn, isWorkingDay, type WorkCalendar } from '../domain/workdays'
import { MONTH_NAMES, WEEK_COLUMNS, formatLongDate, monthCells } from './calendarGrid'

export interface DateRange {
  start: IsoDate | null
  end: IsoDate | null
}

interface DateRangePickerProps {
  year: number
  calendar: WorkCalendar
  value: DateRange
  onChange: (range: DateRange) => void
}

export function DateRangePicker({ year, calendar, value, onChange }: DateRangePickerProps) {
  const today = todayIso()
  const [month, setMonth] = useState(() =>
    value.start && yearOf(value.start) === year ? monthOf(value.start) : monthOf(today),
  )
  const [hovered, setHovered] = useState<IsoDate | null>(null)

  const pick = (date: IsoDate) => {
    if (!value.start || value.end) {
      onChange({ start: date, end: null })
      return
    }
    onChange(
      date < value.start ? { start: date, end: value.start } : { start: value.start, end: date },
    )
  }

  const previewEnd = value.end ?? (value.start && hovered ? hovered : null)
  const from =
    value.start && previewEnd ? (value.start < previewEnd ? value.start : previewEnd) : value.start
  const to =
    value.start && previewEnd ? (value.start < previewEnd ? previewEnd : value.start) : value.start

  const cells = monthCells(year, month)

  return (
    <div className="hairline rounded-[var(--radius-card)] border bg-[var(--color-surface)] p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          aria-label="Mes anterior"
          disabled={month === 1}
          onClick={() => setMonth((current) => Math.max(1, current - 1))}
        >
          ‹
        </button>
        <p className="text-sm font-semibold">
          {MONTH_NAMES[month - 1]} {year}
        </p>
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          aria-label="Mes siguiente"
          disabled={month === 12}
          onClick={() => setMonth((current) => Math.min(12, current + 1))}
        >
          ›
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1">
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

      <div className="grid grid-cols-7 gap-1" onMouseLeave={() => setHovered(null)}>
        {cells.map((date, index) => {
          if (!date) return <span key={`empty-${index}`} />

          const holiday = holidayOn(calendar, date)
          const workable = isWorkingDay(calendar, date)
          const inRange = Boolean(from && to && date >= from && date <= to)
          const isEdge = date === value.start || date === value.end

          const classes = ['day', 'aspect-square', 'cursor-pointer']
          if (isEdge) classes.push('day-selected')
          else if (inRange) classes.push('range-day')
          else if (holiday) classes.push('day-holiday')
          else if (!workable) classes.push('day-off')
          if (date === today) classes.push('day-today')

          return (
            <button
              key={date}
              type="button"
              aria-label={formatLongDate(date)}
              aria-pressed={inRange}
              title={holiday?.name}
              onMouseEnter={() => setHovered(date)}
              onFocus={() => setHovered(date)}
              onClick={() => pick(date)}
              className={classes.join(' ')}
            >
              {dayOf(date)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

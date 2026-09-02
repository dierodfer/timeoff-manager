import { DayPicker, type DateRange as LibRange, type Matcher } from 'react-day-picker'
import { es } from 'react-day-picker/locale'
import { toIso, toUtcDate, todayIso, yearEnd, yearOf, yearStart } from '../domain/dates'
import type { IsoDate } from '../domain/types'
import { holidayOn, isWorkingDay, type WorkCalendar } from '../domain/workdays'

export interface DateRange {
  start: IsoDate | null
  end: IsoDate | null
}

interface DateRangePickerProps {
  readonly year: number
  readonly calendar: WorkCalendar
  readonly value: DateRange
  readonly onChange: (range: DateRange) => void
  readonly minDate?: IsoDate
  readonly maxDate?: IsoDate
}

export function DateRangePicker({
  year,
  calendar,
  value,
  onChange,
  minDate,
  maxDate,
}: DateRangePickerProps) {
  const today = todayIso()

  const selected: LibRange | undefined = value.start
    ? { from: toUtcDate(value.start), to: value.end ? toUtcDate(value.end) : undefined }
    : undefined

  // Solo se lee al montar: como en el resto de la app, el mes visible es estado propio del
  // widget, no algo que el padre controle.
  const defaultMonth =
    value.start && yearOf(value.start) === year ? toUtcDate(value.start) : toUtcDate(today)

  const disabled: Matcher[] = []
  if (minDate) disabled.push({ before: toUtcDate(minDate) })
  if (maxDate) disabled.push({ after: toUtcDate(maxDate) })

  return (
    <DayPicker
      mode="range"
      timeZone="UTC" // como domain/dates.ts: con la hora local un día cambia según el huso horario.
      locale={es}
      navLayout="around"
      resetOnSelect
      startMonth={toUtcDate(yearStart(year))}
      endMonth={toUtcDate(yearEnd(year))}
      defaultMonth={defaultMonth}
      selected={selected}
      disabled={disabled}
      modifiers={{
        holiday: (date) => Boolean(holidayOn(calendar, toIso(date))),
        off: (date) => !isWorkingDay(calendar, toIso(date)),
      }}
      modifiersClassNames={{
        holiday: 'range-picker-day-holiday',
        off: 'range-picker-day-off',
      }}
      classNames={{
        root: 'hairline rounded-[var(--radius-card)] border bg-[var(--color-surface)] p-3',
        month: 'relative',
        month_caption: 'mb-2 flex h-9 items-center justify-center text-sm font-semibold',
        button_previous: 'range-picker-nav-button left-0',
        button_next: 'range-picker-nav-button right-0',
        chevron: 'h-4 w-4 fill-current',
        month_grid: 'mx-auto border-separate border-spacing-0.5',
        weekday: 'pb-1 text-center text-[11px] font-medium text-[var(--color-ink-muted)]',
        day: 'p-0 text-center',
        day_button: 'range-picker-day',
        range_start: 'range-picker-day-selected',
        range_end: 'range-picker-day-selected',
        range_middle: 'range-picker-day-range',
        today: 'range-picker-day-today',
        disabled: 'range-picker-day-disabled',
      }}
      onSelect={(range) => {
        onChange({
          start: range?.from ? toIso(range.from) : null,
          end: range?.to ? toIso(range.to) : null,
        })
      }}
    />
  )
}

import { useState, type FormEvent } from 'react'
import { newId } from '../data/ids'
import { isValidPin, PIN_RULE } from '../data/pin'
import { hasOverlap } from '../domain/accrual'
import { todayIso, yearEnd, yearOf, yearStart } from '../domain/dates'
import type { ActivityPeriod, Employee, Role } from '../domain/types'
import type { WorkCalendar } from '../domain/workdays'
import { DateRangePicker } from './DateRangePicker'

// workweek con los 7 días, no vacío: si no, isWorkingDay() da false siempre y cada celda del
// calendario sale pintada como "day-off", en vez de neutra.
const BLANK_CALENDAR: WorkCalendar = {
  workweek: new Set([0, 1, 2, 3, 4, 5, 6]),
  holidaysByDate: new Map(),
}

export interface EmployeeFormValues {
  firstName: string
  lastName: string
  role: Role
  hireDate: string
  isSeasonal: boolean
  activityPeriods: ActivityPeriod[]
  pin: string
}

function initialValues(employee: Employee | null, year: number): EmployeeFormValues {
  return {
    firstName: employee?.firstName ?? '',
    lastName: employee?.lastName ?? '',
    role: employee?.role ?? 'employee',
    hireDate: employee?.hireDate ?? `${year}-01-01`,
    isSeasonal: employee?.isSeasonal ?? false,
    activityPeriods: employee?.activityPeriods ?? [],
    pin: '',
  }
}

interface EmployeeFormProps {
  readonly employee: Employee | null
  readonly year: number
  readonly onSubmit: (values: EmployeeFormValues) => void
  readonly formId: string
  readonly onError: (message: string) => void
}

export function EmployeeForm({ employee, year, onSubmit, formId, onError }: EmployeeFormProps) {
  const [values, setValues] = useState(() => initialValues(employee, year))
  const isNew = employee === null
  const today = todayIso()

  // Primer clic de un periodo: DateRangePicker manda { end: null } a la espera del segundo clic.
  // ActivityPeriod.end no admite null, así que ese estado intermedio se guarda aparte y no se
  // vuelca a activityPeriods hasta que el segundo clic completa el rango.
  const [pendingStart, setPendingStart] = useState<Record<string, string | undefined>>({})

  const patch = (changes: Partial<EmployeeFormValues>) =>
    setValues((current) => ({ ...current, ...changes }))

  const addPeriod = () => {
    const start = yearStart(year) > today ? today : yearStart(year)
    const end = yearEnd(year) > today ? today : yearEnd(year)
    patch({
      activityPeriods: [...values.activityPeriods, { id: newId('per'), start, end }],
    })
  }

  const updatePeriod = (id: string, changes: Partial<ActivityPeriod>) =>
    patch({
      activityPeriods: values.activityPeriods.map((period) =>
        period.id === id ? { ...period, ...changes } : period,
      ),
    })

  const removePeriod = (id: string) =>
    patch({ activityPeriods: values.activityPeriods.filter((period) => period.id !== id) })

  const submit = (event: FormEvent) => {
    event.preventDefault()

    if (!values.firstName.trim()) return onError('El nombre es obligatorio.')
    if (isNew && !isValidPin(values.pin)) return onError(PIN_RULE)
    if (values.pin && !isValidPin(values.pin)) return onError(PIN_RULE)
    if (values.activityPeriods.some((period) => period.end < period.start)) {
      return onError('Hay un periodo de actividad con la fecha final anterior a la inicial.')
    }
    if (hasOverlap(values.activityPeriods)) {
      return onError('Hay dos periodos de llamamiento que se solapan entre sí.')
    }

    onSubmit(values)
  }

  return (
    <form id={formId} onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="first-name">
            Nombre
          </label>
          <input
            id="first-name"
            className="field"
            required
            value={values.firstName}
            onChange={(event) => patch({ firstName: event.target.value })}
            autoFocus
          />
        </div>
        <div>
          <label className="label" htmlFor="last-name">
            Apellidos
          </label>
          <input
            id="last-name"
            className="field"
            value={values.lastName}
            onChange={(event) => patch({ lastName: event.target.value })}
          />
        </div>
      </div>

      <div>
        <span className="label">Rol</span>
        <div className="segmented">
          <button
            type="button"
            aria-pressed={values.role === 'employee'}
            onClick={() => patch({ role: 'employee' })}
          >
            Empleado
          </button>
          <button
            type="button"
            aria-pressed={values.role === 'admin'}
            onClick={() => patch({ role: 'admin' })}
          >
            Administrador
          </button>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="hire-date">
          Fecha de alta
        </label>
        <input
          id="hire-date"
          type="date"
          className="field"
          required
          value={values.hireDate}
          onChange={(event) => patch({ hireDate: event.target.value })}
        />
      </div>

      <div>
        <span className="label">Tipo de contrato</span>
        <div className="segmented">
          <button
            type="button"
            aria-pressed={!values.isSeasonal}
            onClick={() => {
              if (values.isSeasonal) patch({ isSeasonal: false, hireDate: `${year}-01-01` })
            }}
          >
            Fijo
          </button>
          <button
            type="button"
            aria-pressed={values.isSeasonal}
            onClick={() => {
              if (!values.isSeasonal) patch({ isSeasonal: true, hireDate: today })
            }}
          >
            Fijo discontinuo
          </button>
        </div>
      </div>

      {values.isSeasonal && (
        <div className="hairline rounded-[var(--radius-control)] border p-4">
          <div className="space-y-3">
            <p className="text-xs text-[var(--color-ink-muted)]">
              Añade aquí los periodos de actividad de este último año.
            </p>
            {values.activityPeriods.map((period, index) => {
              // Cada periodo se pinta en el año al que pertenece su propia fecha de inicio, no en
              // el año en curso: así uno histórico de un año anterior se ve y se conserva tal cual,
              // en vez de no aparecer marcado en la rejilla del año en curso y perderse al tocar
              // cualquier día.
              const rowYear = yearOf(period.start)
              const isCurrentYearRow = rowYear === year
              const pending = pendingStart[period.id]
              const value = pending ? { start: pending, end: null } : period

              return (
                <div key={period.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[var(--color-ink-muted)]">
                      Periodo {index + 1}
                    </span>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => removePeriod(period.id)}
                    >
                      Quitar
                    </button>
                  </div>
                  <DateRangePicker
                    year={rowYear}
                    calendar={BLANK_CALENDAR}
                    value={value}
                    minDate={isCurrentYearRow ? yearStart(year) : undefined}
                    maxDate={isCurrentYearRow ? today : yearEnd(rowYear)}
                    onChange={({ start, end }) => {
                      if (!start) return
                      if (!end) {
                        setPendingStart((current) => ({ ...current, [period.id]: start }))
                        return
                      }
                      setPendingStart((current) => ({ ...current, [period.id]: undefined }))
                      updatePeriod(period.id, { start, end })
                    }}
                  />
                </div>
              )
            })}

            <button type="button" className="btn btn-secondary btn-sm" onClick={addPeriod}>
              Añadir periodo
            </button>
          </div>
        </div>
      )}

      <div>
        <label className="label" htmlFor="employee-pin">
          {isNew ? 'PIN de acceso (opcional)' : 'Nuevo PIN (dejar vacío para no cambiarlo)'}
        </label>
        <input
          id="employee-pin"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          className="field tabular"
          value={values.pin}
          onChange={(event) => patch({ pin: event.target.value })}
        />
        <p className="mt-1 text-xs text-[var(--color-ink-muted)]">{PIN_RULE}</p>
      </div>
    </form>
  )
}

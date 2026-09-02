import { es } from 'date-fns/locale/es'
import { useState, type FormEvent } from 'react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { newId } from '../data/ids'
import { isValidPin, PIN_RULE } from '../data/pin'
import { hasOverlap } from '../domain/accrual'
import { isoOf, todayIso, yearEnd, yearOf, yearStart } from '../domain/dates'
import type { ActivityPeriod, Employee, IsoDate, Role } from '../domain/types'

// react-datepicker trabaja con Date en hora local, no UTC como el resto de la app (domain/dates.ts):
// construir y leer siempre con los componentes locales (año/mes/día), nunca con toUtcDate()/toIso(),
// o un día puede desplazarse según la zona horaria del navegador.
function isoToLocalDate(iso: IsoDate): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function localDateToIso(date: Date): IsoDate {
  return isoOf(date.getFullYear(), date.getMonth() + 1, date.getDate())
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

  // Fecha de inicio de un periodo mientras se espera el segundo clic que fija el fin: ver el
  // comentario junto a su uso, más abajo.
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
              // Primer clic del rango: DatePicker manda un end nulo a la espera del segundo clic.
              // ActivityPeriod.end no admite null, así que ese estado intermedio se guarda aparte y
              // no se vuelca a activityPeriods hasta que el segundo clic completa el rango.
              const pendingStartIso = pendingStart[period.id]
              const startDate = isoToLocalDate(pendingStartIso ?? period.start)
              const endDate = pendingStartIso ? null : isoToLocalDate(period.end)

              return (
                <div key={period.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label
                      className="text-xs font-medium text-[var(--color-ink-muted)]"
                      htmlFor={`period-${period.id}`}
                    >
                      Periodo {index + 1}
                    </label>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => removePeriod(period.id)}
                    >
                      Quitar
                    </button>
                  </div>
                  <DatePicker
                    id={`period-${period.id}`}
                    className="field"
                    locale={es}
                    dateFormat="dd-MM-yyyy"
                    // Sin readOnly a propósito: en react-datepicker también apaga la selección por
                    // calendario, no solo el tecleo. Un valor tecleado inválido no llega a
                    // activityPeriods (ver el onChange) y se descarta solo al cerrar el calendario.
                    selectsRange
                    startDate={startDate}
                    endDate={endDate}
                    minDate={isoToLocalDate(
                      isCurrentYearRow ? yearStart(year) : yearStart(rowYear),
                    )}
                    maxDate={isoToLocalDate(isCurrentYearRow ? today : yearEnd(rowYear))}
                    onChange={(dates) => {
                      const [start, end] = dates
                      if (!start) return
                      if (!end) {
                        setPendingStart((current) => ({
                          ...current,
                          [period.id]: localDateToIso(start),
                        }))
                        return
                      }
                      setPendingStart((current) => ({ ...current, [period.id]: undefined }))
                      updatePeriod(period.id, {
                        start: localDateToIso(start),
                        end: localDateToIso(end),
                      })
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

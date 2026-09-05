import { es } from 'date-fns/locale/es'
import { useState, type FormEvent } from 'react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { newId } from '../data/ids'
import { isValidPin, PIN_RULE } from '../data/pin'
import { initialActivityPeriods } from '../data/seed'
import { periodsOverlap } from '../domain/accrual'
import { addDays, compareIso, isoOf, todayIso, yearStart } from '../domain/dates'
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
  isSeasonal: boolean
  activityPeriods: ActivityPeriod[]
  pin: string
}

function initialValues(employee: Employee | null, year: number): EmployeeFormValues {
  return {
    firstName: employee?.firstName ?? '',
    lastName: employee?.lastName ?? '',
    role: employee?.role ?? 'employee',
    isSeasonal: employee?.isSeasonal ?? false,
    activityPeriods: employee?.activityPeriods ?? initialActivityPeriods(yearStart(year)),
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

  const periods = [...values.activityPeriods].sort((a, b) => compareIso(a.start, b.start))
  const openIndex = periods.findIndex((period) => period.end === null)

  const addPeriod = () => {
    const last = periods.at(-1)
    const start = last?.end ? addDays(last.end, 1) : today
    patch({ activityPeriods: [...values.activityPeriods, { id: newId('per'), start, end: null }] })
  }

  const updatePeriod = (id: string, changes: Partial<ActivityPeriod>) =>
    patch({
      activityPeriods: values.activityPeriods.map((period) =>
        period.id === id ? { ...period, ...changes } : period,
      ),
    })

  const removePeriod = (id: string) =>
    patch({ activityPeriods: values.activityPeriods.filter((period) => period.id !== id) })

  // Solo se reescribe la fecha por defecto si hay un único periodo: con varios tramos, cambiar de
  // tipo de contrato no debe tocar un histórico ya registrado.
  const setContract = (isSeasonal: boolean) => {
    if (values.isSeasonal === isSeasonal) return
    if (periods.length !== 1) return patch({ isSeasonal })
    patch({
      isSeasonal,
      activityPeriods: [{ ...periods[0], start: isSeasonal ? today : yearStart(year) }],
    })
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()

    if (!values.firstName.trim()) return onError('El nombre es obligatorio.')
    if (isNew && !isValidPin(values.pin)) return onError(PIN_RULE)
    if (values.pin && !isValidPin(values.pin)) return onError(PIN_RULE)
    if (periods.length === 0) return onError('Añade al menos un periodo de actividad.')
    if (periods.some((period) => period.end !== null && period.end < period.start)) {
      return onError('Hay un periodo de actividad con la fecha final anterior a la inicial.')
    }
    if (periodsOverlap(periods)) {
      return onError('Hay dos periodos de actividad que se solapan entre sí.')
    }
    if (periods.filter((period) => period.end === null).length > 1) {
      return onError('Solo puede haber un periodo en curso.')
    }
    if (openIndex !== -1 && openIndex !== periods.length - 1) {
      return onError('El periodo en curso tiene que ser el último.')
    }

    onSubmit({ ...values, activityPeriods: periods })
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
        <span className="label">Tipo de contrato</span>
        <div className="segmented">
          <button
            type="button"
            aria-pressed={!values.isSeasonal}
            onClick={() => setContract(false)}
          >
            Fijo
          </button>
          <button type="button" aria-pressed={values.isSeasonal} onClick={() => setContract(true)}>
            Fijo discontinuo
          </button>
        </div>
      </div>

      <div>
        <span className="label">Periodos de actividad</span>
        <div className="hairline mt-1 rounded-[var(--radius-control)] border p-4">
          <div className="space-y-3">
            <p className="text-xs text-[var(--color-ink-muted)]">
              {values.isSeasonal
                ? 'Un periodo por cada llamamiento. El que no tiene fecha de fin es el que está en curso.'
                : 'Un periodo por cada tramo de relación laboral. El que no tiene fecha de fin es el que está en curso.'}
            </p>
            {periods.map((period, index) => {
              // Primer clic del rango: DatePicker manda un end nulo a la espera del segundo clic.
              // Un periodo en curso se ve exactamente igual desde el picker, así que ese estado
              // intermedio se guarda aparte y no se vuelca a activityPeriods: si se completara el
              // rango con la fecha de inicio para tener un periodo válido, el picker lo vería
              // relleno y trataría el segundo clic como el inicio de otro rango.
              const pendingStartIso = pendingStart[period.id]
              const startDate = isoToLocalDate(pendingStartIso ?? period.start)
              const isOpen = period.end === null
              const endDate =
                pendingStartIso || period.end === null ? null : isoToLocalDate(period.end)

              // Los límites los ponen los periodos vecinos, que es la única restricción real: un
              // periodo puede cruzar el fin de año y el en curso puede acabar en el futuro.
              const previousEnd = periods[index - 1]?.end
              const nextStart = periods[index + 1]?.start

              return (
                <div key={period.id} className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      className="text-xs font-medium text-[var(--color-ink-muted)]"
                      htmlFor={`period-${period.id}`}
                    >
                      Periodo {index + 1}
                      {isOpen && <span className="chip chip-neutral ml-2">En curso</span>}
                    </label>
                    <div className="flex gap-2">
                      {!isOpen && index === periods.length - 1 && openIndex === -1 && (
                        <button
                          type="button"
                          className="btn btn-quiet btn-sm"
                          onClick={() => updatePeriod(period.id, { end: null })}
                        >
                          Dejar en curso
                        </button>
                      )}
                      {periods.length > 1 && (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => removePeriod(period.id)}
                        >
                          Quitar
                        </button>
                      )}
                    </div>
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
                    minDate={previousEnd ? isoToLocalDate(addDays(previousEnd, 1)) : undefined}
                    maxDate={nextStart ? isoToLocalDate(addDays(nextStart, -1)) : undefined}
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

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={openIndex !== -1}
              title={
                openIndex !== -1
                  ? 'Cierra antes el periodo en curso: solo puede haber uno sin fecha de fin.'
                  : undefined
              }
              onClick={addPeriod}
            >
              Añadir periodo
            </button>
          </div>
        </div>
      </div>

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

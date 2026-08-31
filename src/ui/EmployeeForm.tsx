import { useState, type FormEvent } from 'react'
import { newId } from '../data/ids'
import { isValidPin, PIN_RULE } from '../data/pin'
import type { ActivityPeriod, Employee, Role } from '../domain/types'

export interface EmployeeFormValues {
  firstName: string
  lastName: string
  role: Role
  hireDate: string
  terminationDate: string
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
    terminationDate: employee?.terminationDate ?? '',
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

  const patch = (changes: Partial<EmployeeFormValues>) =>
    setValues((current) => ({ ...current, ...changes }))

  const addPeriod = () =>
    patch({
      activityPeriods: [
        ...values.activityPeriods,
        { id: newId('per'), start: `${year}-01-01`, end: `${year}-12-31` },
      ],
    })

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
    if (values.terminationDate && values.terminationDate < values.hireDate) {
      return onError('La fecha de baja no puede ser anterior a la de alta.')
    }
    if (values.activityPeriods.some((period) => period.end < period.start)) {
      return onError('Hay un periodo de actividad con la fecha final anterior a la inicial.')
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

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="hire-date">
            Fecha de alta
          </label>
          <input
            id="hire-date"
            type="date"
            className="field"
            value={values.hireDate}
            onChange={(event) => patch({ hireDate: event.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="termination-date">
            Fecha de baja (opcional)
          </label>
          <input
            id="termination-date"
            type="date"
            className="field"
            value={values.terminationDate}
            onChange={(event) => patch({ terminationDate: event.target.value })}
          />
        </div>
      </div>

      <div className="hairline rounded-[var(--radius-control)] border p-4">
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={values.isSeasonal}
            onChange={(event) => patch({ isSeasonal: event.target.checked })}
          />
          <span>
            <span className="font-medium">Fijo discontinuo</span>
            <span className="block text-xs text-[var(--color-ink-muted)]">
              La estimación se prorratea solo sobre sus periodos de llamamiento.
            </span>
          </span>
        </label>

        {values.isSeasonal && (
          <div className="mt-4 space-y-3">
            {values.activityPeriods.map((period) => (
              <div key={period.id} className="flex flex-wrap items-end gap-2">
                <div className="min-w-32 flex-1">
                  <label className="label" htmlFor={`start-${period.id}`}>
                    Desde
                  </label>
                  <input
                    id={`start-${period.id}`}
                    type="date"
                    className="field"
                    value={period.start}
                    onChange={(event) => updatePeriod(period.id, { start: event.target.value })}
                  />
                </div>
                <div className="min-w-32 flex-1">
                  <label className="label" htmlFor={`end-${period.id}`}>
                    Hasta
                  </label>
                  <input
                    id={`end-${period.id}`}
                    type="date"
                    className="field"
                    value={period.end}
                    onChange={(event) => updatePeriod(period.id, { end: event.target.value })}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => removePeriod(period.id)}
                >
                  Quitar
                </button>
              </div>
            ))}

            <button type="button" className="btn btn-secondary btn-sm" onClick={addPeriod}>
              Añadir periodo
            </button>
          </div>
        )}
      </div>

      <div>
        <label className="label" htmlFor="employee-pin">
          {isNew ? 'PIN de acceso' : 'Nuevo PIN (dejar vacío para no cambiarlo)'}
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

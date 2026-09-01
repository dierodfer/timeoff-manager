import { useMemo, useState, type FormEvent } from 'react'
import { hashPin, randomSalt } from '../data/pin'
import { createEmployee } from '../data/seed'
import { employmentSpanInYear, workedDaysInYear } from '../domain/accrual'
import { terminationSettlement, withBalances } from '../domain/balance'
import { formatDate, formatDays, pluralDays } from '../domain/format'
import { todayIso } from '../domain/dates'
import type { Employee } from '../domain/types'
import {
  clearAllowance,
  displayName,
  setAllowance,
  sortByName,
  terminateEmployee,
} from '../state/actions'
import { useSession } from '../state/appContext'
import { EmployeeForm, type EmployeeFormValues } from '../ui/EmployeeForm'
import { Modal } from '../ui/Modal'
import { Stepper } from '../ui/Stepper'

type Dialog =
  | { kind: 'form'; employee: Employee | null }
  | { kind: 'baja'; employee: Employee }
  | { kind: 'delete'; employee: Employee }
  | null

function seasonalSummary(employee: Employee): string {
  if (!employee.isSeasonal) return ''
  const count = employee.activityPeriods.length
  return ` · fijo discontinuo (${count} ${count === 1 ? 'periodo' : 'periodos'})`
}

export function Employees() {
  const { database, currentUser, year, commit, apply, notify } = useSession()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [showInactive, setShowInactive] = useState(false)

  const today = todayIso()
  const [bajaDate, setBajaDate] = useState(today)

  const employees = useMemo(() => {
    const isInactive = (employee: Employee) =>
      Boolean(employee.terminationDate && employee.terminationDate < today)
    return sortByName(
      database.employees.filter((employee) => showInactive || !isInactive(employee)),
    )
  }, [database.employees, showInactive, today])

  const rows = useMemo(
    () => withBalances(employees, year, database.settings, database.allowances, database.requests),
    [employees, year, database.settings, database.allowances, database.requests],
  )

  const saveEmployee = async (values: EmployeeFormValues) => {
    if (dialog?.kind !== 'form') return
    const existing = dialog.employee

    if (!existing) {
      const employee = await createEmployee({
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        role: values.role,
        hireDate: values.hireDate,
        terminationDate: values.terminationDate || null,
        isSeasonal: values.isSeasonal,
        activityPeriods: values.isSeasonal ? values.activityPeriods : [],
        pin: values.pin,
      })
      commit({ ...database, employees: [...database.employees, employee] })
      notify(`${displayName(employee)} dado de alta.`)
    } else {
      const pinSalt = values.pin ? randomSalt() : existing.pinSalt
      const pinHash = values.pin ? await hashPin(values.pin, pinSalt) : existing.pinHash
      const updated: Employee = {
        ...existing,
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        role: values.role,
        hireDate: values.hireDate,
        terminationDate: values.terminationDate || null,
        isSeasonal: values.isSeasonal,
        activityPeriods: values.isSeasonal ? values.activityPeriods : [],
        pinSalt,
        pinHash,
      }
      commit({
        ...database,
        employees: database.employees.map((item) => (item.id === existing.id ? updated : item)),
      })
      notify('Cambios guardados.')
    }

    setDialog(null)
  }

  const bajaSettlement = useMemo(() => {
    if (dialog?.kind !== 'baja') return null
    return terminationSettlement(
      dialog.employee,
      year,
      database.settings,
      database.requests,
      bajaDate,
      today,
    )
  }, [dialog, bajaDate, year, database.settings, database.requests, today])

  const confirmBaja = (event: FormEvent, employee: Employee) => {
    event.preventDefault()
    commit(terminateEmployee(database, employee.id, bajaDate))
    notify(`${displayName(employee)} dado de baja el ${formatDate(bajaDate)}.`)
    setDialog(null)
  }

  const removeEmployee = (employee: Employee) => {
    commit({
      ...database,
      employees: database.employees.filter((item) => item.id !== employee.id),
      requests: database.requests.filter((item) => item.employeeId !== employee.id),
      allowances: database.allowances.filter((item) => item.employeeId !== employee.id),
    })
    notify(`${displayName(employee)} eliminado.`)
    setDialog(null)
  }

  const adminCount = database.employees.filter((employee) => employee.role === 'admin').length

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl">Empleados</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Los días de {year} salen de la estimación automática; ajústalos con + y − cuando haga
            falta.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-[var(--color-ink-muted)]">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(event) => setShowInactive(event.target.checked)}
            />{' '}
            Ver bajas
          </label>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setDialog({ kind: 'form', employee: null })}
          >
            Nuevo empleado
          </button>
        </div>
      </div>

      <div className="card divide-y divide-[var(--color-hairline)] overflow-hidden">
        {rows.map(({ employee, balance }) => {
          const inYear = employmentSpanInYear(employee, year)
          const isInactive = Boolean(employee.terminationDate && employee.terminationDate < today)

          return (
            <div key={employee.id} className="flex flex-wrap items-center gap-4 p-4">
              <div className="min-w-52 flex-1">
                <p className="text-[15px] font-medium">
                  {displayName(employee)}
                  {employee.id === currentUser.id && (
                    <span className="chip chip-neutral ml-2">Tú</span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">
                  {employee.role === 'admin' ? 'Administrador' : 'Empleado'} · alta{' '}
                  {formatDate(employee.hireDate)}
                  {employee.terminationDate
                    ? ` · baja ${formatDate(employee.terminationDate)}`
                    : ''}
                  {seasonalSummary(employee)}
                </p>
                {inYear && (
                  <p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">
                    {workedDaysInYear(employee, year, database.settings.workweek)} días trabajados
                    en {year} · estimación {formatDays(balance.estimated)} · aprobados{' '}
                    {balance.approved} · pendientes {balance.pending}
                  </p>
                )}
              </div>

              {inYear ? (
                <div className="flex items-center gap-2">
                  <Stepper
                    label={displayName(employee)}
                    value={balance.assigned}
                    onChange={(next) => apply((db) => setAllowance(db, employee.id, year, next))}
                  />
                  {balance.isOverridden && (
                    <button
                      type="button"
                      className="btn btn-quiet btn-sm"
                      title={`Volver a la estimación (${formatDays(balance.estimated)} días)`}
                      onClick={() => {
                        commit(clearAllowance(database, employee.id, year))
                        notify('Días restablecidos a la estimación.')
                      }}
                    >
                      Restablecer
                    </button>
                  )}
                </div>
              ) : (
                <span className="chip chip-neutral">Sin actividad en {year}</span>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setDialog({ kind: 'form', employee })}
                >
                  Editar
                </button>

                {!isInactive && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setBajaDate(today)
                      setDialog({ kind: 'baja', employee })
                    }}
                  >
                    Dar de baja
                  </button>
                )}

                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  disabled={employee.role === 'admin' && adminCount === 1}
                  title={
                    employee.role === 'admin' && adminCount === 1
                      ? 'Es el único administrador'
                      : undefined
                  }
                  onClick={() => setDialog({ kind: 'delete', employee })}
                >
                  Eliminar
                </button>
              </div>
            </div>
          )
        })}

        {employees.length === 0 && (
          <p className="p-6 text-sm text-[var(--color-ink-muted)]">No hay empleados que mostrar.</p>
        )}
      </div>

      {dialog?.kind === 'form' && (
        <Modal
          title={dialog.employee ? 'Editar empleado' : 'Nuevo empleado'}
          onClose={() => setDialog(null)}
          wide
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setDialog(null)}>
                Cancelar
              </button>
              <button type="submit" form="employee-form" className="btn btn-primary">
                Guardar
              </button>
            </>
          }
        >
          <EmployeeForm
            key={dialog.employee?.id ?? 'nuevo'}
            formId="employee-form"
            employee={dialog.employee}
            year={year}
            onSubmit={(values) => void saveEmployee(values)}
            onError={(message) => notify(message, 'error')}
          />
        </Modal>
      )}

      {dialog?.kind === 'baja' && bajaSettlement && (
        <Modal
          title={`Dar de baja a ${displayName(dialog.employee)}`}
          onClose={() => setDialog(null)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setDialog(null)}>
                Cancelar
              </button>
              <button type="submit" form="baja-form" className="btn btn-primary">
                Confirmar baja
              </button>
            </>
          }
        >
          <form
            id="baja-form"
            onSubmit={(event) => confirmBaja(event, dialog.employee)}
            className="space-y-4"
          >
            <div>
              <label className="label" htmlFor="baja-date">
                Fecha de baja
              </label>
              <input
                id="baja-date"
                type="date"
                className="field"
                required
                min={dialog.employee.hireDate}
                max={today}
                value={bajaDate}
                onChange={(event) => setBajaDate(event.target.value)}
              />
            </div>

            <div className="hairline space-y-1 rounded-[var(--radius-control)] border p-3 text-sm">
              <p>{pluralDays(bajaSettlement.taken)} disfrutados hasta hoy.</p>
              <p>
                Le corresponden {pluralDays(bajaSettlement.entitlement)} con esta fecha de baja.
              </p>
              {bajaSettlement.difference > 1e-9 ? (
                <p className="font-medium text-[var(--color-approved)]">
                  Se le deben {pluralDays(bajaSettlement.difference)}.
                </p>
              ) : bajaSettlement.difference < -1e-9 ? (
                <p className="font-medium text-[var(--color-rejected)]">
                  El empleado debe {pluralDays(Math.abs(bajaSettlement.difference))}.
                </p>
              ) : (
                <p className="text-[var(--color-ink-muted)]">
                  Está en paz: ha disfrutado justo lo que le correspondía.
                </p>
              )}
            </div>
          </form>
        </Modal>
      )}

      {dialog?.kind === 'delete' && (
        <Modal
          title={`Eliminar a ${displayName(dialog.employee)}`}
          description="Se borrarán también sus solicitudes y sus días ajustados. Si solo quieres cerrar su relación laboral, usa «Dar de baja» y conservarás el histórico."
          onClose={() => setDialog(null)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setDialog(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => removeEmployee(dialog.employee)}
              >
                Eliminar definitivamente
              </button>
            </>
          }
        >
          <p className="text-sm text-[var(--color-ink-soft)]">Esta acción no se puede deshacer.</p>
        </Modal>
      )}
    </div>
  )
}

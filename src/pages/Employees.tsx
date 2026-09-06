import {
  ChevronRight,
  Inbox,
  Layers,
  Plus,
  Search,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { hashPin, randomSalt } from '../data/pin'
import { createEmployee } from '../data/seed'
import {
  estimateAnnualDays,
  isActive,
  isActiveInYear,
  lastEndDate,
  openPeriod,
  sortedPeriods,
  workedDaysToDate,
} from '../domain/accrual'
import { pendingDaysInYear, terminationSettlement, withBalances } from '../domain/balance'
import { formatDate, formatDays, pluralDays } from '../domain/format'
import { addDays, compareIso, todayIso } from '../domain/dates'
import type { Employee, IsoDate } from '../domain/types'
import {
  clearAllowance,
  deleteEmployee,
  displayName,
  rehireEmployee,
  setAllowance,
  sortByName,
  terminateEmployee,
} from '../state/actions'
import { useSession } from '../state/appContext'
import { Avatar } from '../ui/Avatar'
import { EmployeeForm, type EmployeeFormValues } from '../ui/EmployeeForm'
import { Metric } from '../ui/Metric'
import { Modal } from '../ui/Modal'
import { RowMenu } from '../ui/RowMenu'
import { SelectField } from '../ui/SelectField'
import { Stepper } from '../ui/Stepper'

type Dialog =
  | { kind: 'form'; employee: Employee | null }
  | { kind: 'baja'; employee: Employee }
  | { kind: 'alta'; employee: Employee }
  | { kind: 'delete'; employee: Employee }
  | null

const STATUS = { todos: 'Todos', activos: 'En activo', bajas: 'De baja' }
const CONTRACT = { todos: 'Todos', fijo: 'Fijo', discontinuo: 'Fijo discontinuo' }
const ORDER = { nombre: 'Nombre (A–Z)', 'nombre-desc': 'Nombre (Z–A)', alta: 'Alta más reciente' }

type StatusFilter = keyof typeof STATUS
type ContractFilter = keyof typeof CONTRACT
type SortOrder = keyof typeof ORDER

function minAltaDate(employee: Employee, today: IsoDate): IsoDate {
  const last = lastEndDate(employee)
  return last ? addDays(last, 1) : today
}

function periodsSummary(employee: Employee): string {
  return sortedPeriods(employee)
    .map(
      (period) =>
        `${formatDate(period.start)} – ${period.end ? formatDate(period.end) : 'actualidad'}`,
    )
    .join(' · ')
}

export function Employees() {
  const { database, currentUser, year, commit, apply, notify } = useSession()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('todos')
  const [contract, setContract] = useState<ContractFilter>('todos')
  const [order, setOrder] = useState<SortOrder>('nombre')

  const today = todayIso()
  const [dialogDate, setDialogDate] = useState(today)

  const employees = useMemo(() => {
    const term = search.trim().toLowerCase()
    const matching = database.employees.filter((employee) => {
      if (term && !displayName(employee).toLowerCase().includes(term)) return false
      if (status === 'activos' && !isActive(employee, today)) return false
      if (status === 'bajas' && isActive(employee, today)) return false
      if (contract === 'fijo' && employee.isSeasonal) return false
      if (contract === 'discontinuo' && !employee.isSeasonal) return false
      return true
    })

    if (order === 'alta') {
      return [...matching].sort((a, b) =>
        compareIso(sortedPeriods(b).at(-1)?.start ?? '', sortedPeriods(a).at(-1)?.start ?? ''),
      )
    }
    const byName = sortByName(matching)
    return order === 'nombre-desc' ? byName.reverse() : byName
  }, [database.employees, search, status, contract, order, today])

  const rows = useMemo(
    () =>
      withBalances(employees, year, database.settings, database.allowances, database.requests).map(
        (row) => ({
          ...row,
          inYear: isActiveInYear(row.employee, year),
          last: sortedPeriods(row.employee).at(-1),
          active: isActive(row.employee, today),
          employed: Boolean(openPeriod(row.employee)),
          worked: workedDaysToDate(row.employee, year, database.settings.workweek, today),
        }),
      ),
    [employees, year, today, database.settings, database.allowances, database.requests],
  )

  const inYearCount = (of: number) =>
    database.employees.filter((employee) => isActiveInYear(employee, of)).length
  const activeCount = inYearCount(year)
  const delta = activeCount - inYearCount(year - 1)
  const pendingCount = pendingDaysInYear(database.requests, year)

  const saveEmployee = async (values: EmployeeFormValues) => {
    if (dialog?.kind !== 'form') return
    const existing = dialog.employee

    if (!existing) {
      const employee = await createEmployee({
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        role: values.role,
        isSeasonal: values.isSeasonal,
        activityPeriods: values.activityPeriods,
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
        isSeasonal: values.isSeasonal,
        activityPeriods: values.activityPeriods,
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
      dialogDate,
      today,
    )
  }, [dialog, dialogDate, year, database.settings, database.requests, today])

  const altaEstimate = useMemo(() => {
    if (dialog?.kind !== 'alta') return null
    const rehired = {
      ...dialog.employee,
      activityPeriods: [
        ...dialog.employee.activityPeriods,
        { id: 'vista-previa', start: dialogDate, end: null },
      ],
    }
    return estimateAnnualDays(rehired, year, database.settings)
  }, [dialog, dialogDate, year, database.settings])

  const lastEnd = dialog?.kind === 'alta' ? lastEndDate(dialog.employee) : null

  const confirmBaja = (event: FormEvent, employee: Employee) => {
    event.preventDefault()
    if (!apply((db) => terminateEmployee(db, employee.id, dialogDate))) return
    notify(`${displayName(employee)} dado de baja el ${formatDate(dialogDate)}.`)
    setDialog(null)
  }

  const confirmAlta = (event: FormEvent, employee: Employee) => {
    event.preventDefault()
    if (!apply((db) => rehireEmployee(db, employee.id, dialogDate))) return
    notify(`${displayName(employee)} dado de alta el ${formatDate(dialogDate)}.`)
    setDialog(null)
  }

  const removeEmployee = (employee: Employee) => {
    if (!apply((db) => deleteEmployee(db, employee.id))) return
    notify(`${displayName(employee)} eliminado.`)
    setDialog(null)
  }

  const openDialog = (kind: 'baja' | 'alta', employee: Employee) => {
    const min = minAltaDate(employee, today)
    setDialogDate(kind === 'alta' && min > today ? min : today)
    setDialog({ kind, employee })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] leading-tight">Empleados</h1>
          <p className="mt-1 text-[15px] text-[var(--color-ink-muted)]">
            Gestiona los empleados y sus periodos de actividad, vacaciones y ausencias.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/asignacion" className="btn btn-alt">
            <Layers className="size-[18px]" />
            Asignación masiva
          </Link>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setDialog({ kind: 'form', employee: null })}
          >
            <Plus className="size-[18px]" />
            Nuevo empleado
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card stat-card">
          <span className="badge-icon">
            <Users className="size-5" />
          </span>
          <div className="flex-1">
            <Metric
              layout="value-first"
              value={activeCount}
              label={`${activeCount === 1 ? 'Empleado' : 'Empleados'} con actividad en ${year}`}
            />
            {delta !== 0 && (
              <p
                className="mt-0.5 flex items-center gap-1 text-xs font-medium"
                style={{ color: `var(--color-${delta > 0 ? 'approved' : 'rejected'})` }}
              >
                {delta > 0 ? (
                  <TrendingUp className="size-3.5" />
                ) : (
                  <TrendingDown className="size-3.5" />
                )}
                {Math.abs(delta)} vs. {year - 1}
              </p>
            )}
          </div>
        </div>

        <Link
          to="/solicitudes"
          className="card stat-card transition hover:bg-[var(--color-surface-sunken)]"
        >
          <span className="badge-icon">
            <Inbox className="size-5" />
          </span>
          <div className="flex-1">
            <Metric layout="value-first" value={pendingCount} label="Solicitudes pendientes" />
          </div>
          <ChevronRight className="size-5 text-[var(--color-ink-muted)]" />
        </Link>
      </div>

      <div className="card grid gap-3 p-4 md:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]">
        <div>
          <label className="label" htmlFor="buscar-empleado">
            Buscar
          </label>
          <span className="relative block">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--color-ink-muted)]" />
            <input
              id="buscar-empleado"
              type="search"
              className="field pl-9"
              placeholder="Buscar por nombre…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </span>
        </div>

        <SelectField
          id="filtro-estado"
          label="Estado"
          value={status}
          options={STATUS}
          onChange={setStatus}
        />
        <SelectField
          id="filtro-contrato"
          label="Tipo de contrato"
          value={contract}
          options={CONTRACT}
          onChange={setContract}
        />
        <SelectField
          id="filtro-orden"
          label="Ordenar por"
          value={order}
          options={ORDER}
          onChange={setOrder}
        />
      </div>

      <div className="card divide-y divide-[var(--color-hairline)]">
        {rows.map(({ employee, balance, inYear, last, active, employed, worked }) => (
          <div key={employee.id} className="flex flex-wrap items-center gap-x-6 gap-y-4 p-4">
            <div className="flex min-w-60 flex-1 items-start gap-3">
              <Avatar employee={employee} size="lg" />
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
                  {displayName(employee)}
                  {employee.id === currentUser.id && <span className="chip chip-neutral">Tú</span>}
                  <span className={active ? 'chip chip-aprobada' : 'chip chip-neutral'}>
                    {active ? 'Activo' : 'De baja'}
                  </span>
                </p>
                <p className="mt-0.5 text-[13px] text-[var(--color-ink-muted)]">
                  {employee.role === 'admin' ? 'Administrador' : 'Empleado'}
                  {employee.isSeasonal ? ' · Fijo discontinuo' : ' · Fijo'}
                  {last ? ` · Alta ${formatDate(last.start)}` : ''}
                  {last?.end ? ` · Baja ${formatDate(last.end)}` : ''}
                </p>
                {employee.activityPeriods.length > 1 && (
                  <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                    Periodos de actividad: {periodsSummary(employee)}
                  </p>
                )}
              </div>
            </div>

            {inYear ? (
              <>
                <div className="flex flex-none gap-6">
                  <Metric
                    layout="value-first"
                    value={worked}
                    label={
                      <>
                        Días trabajados<span className="block">hasta hoy</span>
                      </>
                    }
                  />
                  <Metric
                    layout="value-first"
                    value={formatDays(balance.estimated)}
                    label="Estimación"
                  />
                  <Metric layout="value-first" value={balance.approved} label="Aprobados" />
                  <Metric
                    layout="value-first"
                    value={balance.pending}
                    label="Pendientes"
                    tone={balance.pending > 0 ? 'var(--color-pending)' : undefined}
                  />
                </div>

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
              </>
            ) : (
              <span className="chip chip-neutral">Sin actividad en {year}</span>
            )}

            <RowMenu
              label={`Acciones de ${displayName(employee)}`}
              items={[
                { label: 'Editar', onSelect: () => setDialog({ kind: 'form', employee }) },
                {
                  label: employed ? 'Dar de baja' : 'Dar de alta',
                  onSelect: () => openDialog(employed ? 'baja' : 'alta', employee),
                },
                {
                  label: 'Eliminar',
                  danger: true,
                  disabled: employed,
                  disabledReason: 'Da de baja al empleado antes de eliminarlo',
                  onSelect: () => setDialog({ kind: 'delete', employee }),
                },
              ]}
            />
          </div>
        ))}

        {rows.length === 0 && (
          <p className="p-8 text-center text-sm text-[var(--color-ink-muted)]">
            Ningún empleado coincide con los filtros.
          </p>
        )}

        {rows.length > 0 && (
          <p className="px-4 py-3 text-xs text-[var(--color-ink-muted)]">
            Mostrando {rows.length} de {database.employees.length} empleados
          </p>
        )}
      </div>

      {dialog?.kind === 'form' && (
        <Modal
          title={dialog.employee ? 'Editar empleado' : 'Nuevo empleado'}
          onClose={() => setDialog(null)}
          confirm={{ label: 'Guardar', form: 'employee-form' }}
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
          confirm={{ label: 'Confirmar baja', form: 'baja-form' }}
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
                min={openPeriod(dialog.employee)?.start}
                value={dialogDate}
                onChange={(event) => setDialogDate(event.target.value)}
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

      {dialog?.kind === 'alta' && altaEstimate !== null && (
        <Modal
          title={`Dar de alta a ${displayName(dialog.employee)}`}
          onClose={() => setDialog(null)}
          confirm={{ label: 'Confirmar alta', form: 'alta-form' }}
        >
          <form
            id="alta-form"
            onSubmit={(event) => confirmAlta(event, dialog.employee)}
            className="space-y-4"
          >
            <div>
              <label className="label" htmlFor="alta-date">
                Fecha de alta
              </label>
              <input
                id="alta-date"
                type="date"
                className="field"
                required
                min={minAltaDate(dialog.employee, today)}
                value={dialogDate}
                onChange={(event) => setDialogDate(event.target.value)}
              />
            </div>

            <div className="hairline space-y-1 rounded-[var(--radius-control)] border p-3 text-sm">
              {lastEnd && <p>Su último periodo terminó el {formatDate(lastEnd)}.</p>}
              <p>
                Con esta fecha le corresponderían {pluralDays(altaEstimate)} en {year}.
              </p>
            </div>
          </form>
        </Modal>
      )}

      {dialog?.kind === 'delete' && (
        <Modal
          title={`Eliminar a ${displayName(dialog.employee)}`}
          description="Se borrarán también sus solicitudes y sus días ajustados. Si solo quieres cerrar su relación laboral, usa «Dar de baja» y conservarás el histórico."
          onClose={() => setDialog(null)}
          confirm={{
            label: 'Eliminar definitivamente',
            danger: true,
            onClick: () => removeEmployee(dialog.employee),
          }}
        >
          <p className="text-sm text-[var(--color-ink-soft)]">Esta acción no se puede deshacer.</p>
        </Modal>
      )}
    </div>
  )
}

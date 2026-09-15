import { CalendarDays, ListChecks } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  ACCRUAL_PER_WORKED_DAY,
  sortedPeriods,
  type EstimateBreakdown,
  type WorkedDaysBreakdown,
} from '../domain/accrual'
import type { Balance } from '../domain/balance'
import { todayIso } from '../domain/dates'
import { formatDate, formatDays } from '../domain/format'
import type { ActivityPeriod, Employee } from '../domain/types'
import { displayName } from '../state/actions'
import { Avatar } from './Avatar'
import { Metric } from './Metric'
import { MetricInfo } from './MetricInfo'
import { RowMenu } from './RowMenu'
import { Stepper } from './Stepper'

const ACCRUAL_RATE_LABEL = ACCRUAL_PER_WORKED_DAY.toString().replace('.', ',')

function rangeLabel(start: string, end: string, today: string): string {
  return `${formatDate(start)} – ${end === today ? 'hoy' : formatDate(end)}`
}

function WorkedTooltip({
  breakdown,
  today,
}: {
  readonly breakdown: WorkedDaysBreakdown
  readonly today: string
}) {
  return (
    <div className="space-y-2">
      <div className="space-y-0.5">
        {breakdown.ranges.map((range) => (
          <p key={range.start}>
            <span className="font-semibold text-[var(--color-ink)]">
              {rangeLabel(range.start, range.end, today)}
            </span>
            : {range.days} {range.days === 1 ? 'día' : 'días'}
          </p>
        ))}
      </div>
      {breakdown.holidays.length > 0 && (
        <div className="space-y-0.5 border-t border-[var(--color-hairline)] pt-2">
          <p className="font-semibold text-[var(--color-ink)]">Festivos descontados</p>
          {breakdown.holidays.map((holiday) => (
            <p key={holiday.id}>
              {formatDate(holiday.date)} · {holiday.name}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

function EstimateTooltip({ breakdown }: { readonly breakdown: EstimateBreakdown }) {
  return (
    <div className="space-y-1">
      <p>
        <span className="font-semibold text-[var(--color-ink)]">{ACCRUAL_RATE_LABEL}</span> ×{' '}
        {breakdown.worked} {breakdown.worked === 1 ? 'día trabajado' : 'días trabajados'} ={' '}
        {formatDays(breakdown.raw)}
      </p>
      {breakdown.isCapped && (
        <p className="text-[var(--color-ink-muted)]">
          Tope anual: {formatDays(breakdown.cap)} días
        </p>
      )}
    </div>
  )
}

function periodsSummary(employee: Employee): string {
  return sortedPeriods(employee)
    .map(
      (period) =>
        `${formatDate(period.start)} – ${period.end ? formatDate(period.end) : 'actualidad'}`,
    )
    .join(' · ')
}

export interface EmployeeRowData {
  employee: Employee
  balance: Balance
  /** Si tuvo actividad en el año que se está mirando; si no, no hay cifras que enseñar. */
  inYear: boolean
  last: ActivityPeriod | undefined
  active: boolean
  /** Con un periodo abierto: se le puede dar de baja, y no se puede borrar. */
  employed: boolean
  worked: number
  workedBreakdown: WorkedDaysBreakdown
  estimateBreakdown: EstimateBreakdown
}

interface EmployeeRowProps {
  readonly row: EmployeeRowData
  readonly year: number
  readonly isCurrentUser: boolean
  readonly onEdit: () => void
  readonly onToggleEmployment: () => void
  readonly onDelete: () => void
  readonly onAssignedChange: (days: number) => void
  readonly onResetAssigned: () => void
}

export function EmployeeRow({
  row,
  year,
  isCurrentUser,
  onEdit,
  onToggleEmployment,
  onDelete,
  onAssignedChange,
  onResetAssigned,
}: EmployeeRowProps) {
  const {
    employee,
    balance,
    inYear,
    last,
    active,
    employed,
    worked,
    workedBreakdown,
    estimateBreakdown,
  } = row
  const nombre = displayName(employee)
  const today = todayIso()

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-4 p-4">
      <div className="flex min-w-60 flex-1 items-start gap-3">
        <Avatar employee={employee} size="lg" />
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
            {nombre}
            {isCurrentUser && <span className="chip chip-neutral">Tú</span>}
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
            <MetricInfo
              value={worked}
              label={
                <>
                  Días trabajados<span className="block">hasta hoy</span>
                </>
              }
              panelLabel={`Desglose de días trabajados de ${nombre}`}
            >
              <WorkedTooltip breakdown={workedBreakdown} today={today} />
            </MetricInfo>
            <MetricInfo
              value={formatDays(balance.estimated)}
              label="Estimación"
              panelLabel={`Cálculo de la estimación de ${nombre}`}
            >
              <EstimateTooltip breakdown={estimateBreakdown} />
            </MetricInfo>
            <div>
              <Metric layout="value-first" value={balance.approved} label="Aprobados" />
              <Link
                to={`/?empleado=${employee.id}`}
                className="mt-1 flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline"
              >
                <CalendarDays className="size-3.5" />
                Ver calendario
              </Link>
            </div>
            <div>
              <Metric
                layout="value-first"
                value={balance.pending}
                label="Pendientes"
                tone={balance.pending > 0 ? 'var(--color-pending)' : undefined}
              />
              <Link
                to={`/solicitudes?empleado=${employee.id}`}
                className="mt-1 flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline"
              >
                <ListChecks className="size-3.5" />
                Ver solicitudes
              </Link>
            </div>
          </div>

          <div className="flex flex-col items-center gap-1">
            <Stepper label={nombre} value={balance.assigned} onChange={onAssignedChange} />
            {balance.isOverridden && (
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                title={`Volver a la estimación (${formatDays(balance.estimated)} días)`}
                onClick={onResetAssigned}
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
        label={`Acciones de ${nombre}`}
        items={[
          { label: 'Editar', onSelect: onEdit },
          { label: employed ? 'Dar de baja' : 'Dar de alta', onSelect: onToggleEmployment },
          {
            label: 'Eliminar',
            danger: true,
            disabled: employed,
            disabledReason: 'Da de baja al empleado antes de eliminarlo',
            onSelect: onDelete,
          },
        ]}
      />
    </div>
  )
}

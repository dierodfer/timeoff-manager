/** Fecha en formato ISO corto `yyyy-MM-dd`. Es el formato canónico en todo el dominio. */
export type IsoDate = string

export type Role = 'admin' | 'employee'

/** Periodo de llamamiento de un empleado fijo discontinuo. */
export interface ActivityPeriod {
  id: string
  start: IsoDate
  end: IsoDate
}

export interface Employee {
  id: string
  firstName: string
  lastName: string
  role: Role
  hireDate: IsoDate
  /** Fecha de baja. `null` mientras el empleado sigue activo. */
  terminationDate: IsoDate | null
  isSeasonal: boolean
  /** Solo se tiene en cuenta cuando `isSeasonal` es cierto. */
  activityPeriods: ActivityPeriod[]
  pinHash: string
  pinSalt: string
  createdAt: string
}

export type RequestStatus = 'pendiente' | 'aprobada' | 'rechazada'

export interface RequestComment {
  id: string
  authorId: string
  authorName: string
  text: string
  createdAt: string
}

export interface VacationRequest {
  id: string
  employeeId: string
  year: number
  /** Días laborables ya filtrados: aquí no hay domingos ni festivos. */
  days: IsoDate[]
  status: RequestStatus
  createdBy: string
  createdAt: string
  resolvedBy: string | null
  resolvedAt: string | null
  comments: RequestComment[]
  /** Agrupa las solicitudes creadas en una misma asignación masiva. */
  batchId: string | null
}

export type HolidayScope = 'nacional' | 'andalucia' | 'algarrobo'

export interface Holiday {
  id: string
  date: IsoDate
  name: string
  scope: HolidayScope
}

/**
 * Ajuste manual del administrador sobre los días de un empleado en un año.
 * Si no existe registro, rige la estimación automática.
 */
export interface Allowance {
  employeeId: string
  year: number
  days: number
}

export interface Settings {
  organizationName: string
  /** Base anual de días de vacaciones antes de prorratear. */
  defaultAnnualDays: number
  /** Días de la semana que se consideran laborables. 0 = domingo … 6 = sábado. */
  workweek: number[]
}

export interface Database {
  settings: Settings
  employees: Employee[]
  holidays: Holiday[]
  requests: VacationRequest[]
  allowances: Allowance[]
}

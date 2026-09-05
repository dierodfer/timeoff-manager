export type IsoDate = string

export type Role = 'admin' | 'employee'

export interface ActivityPeriod {
  id: string
  start: IsoDate
  /** `null` = periodo en curso: solo puede haber uno y es el de inicio más tardío. */
  end: IsoDate | null
}

export interface Employee {
  id: string
  firstName: string
  lastName: string
  role: Role
  isSeasonal: boolean
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
  days: IsoDate[]
  status: RequestStatus
  createdBy: string
  createdAt: string
  resolvedBy: string | null
  resolvedAt: string | null
  comments: RequestComment[]
  batchId: string | null
}

export type HolidayScope = 'nacional' | 'andalucia' | 'algarrobo'

export interface Holiday {
  id: string
  date: IsoDate
  name: string
  scope: HolidayScope
}

export interface Allowance {
  employeeId: string
  year: number
  days: number
}

export interface Settings {
  organizationName: string
  defaultAnnualDays: number
  /** 0 = domingo, 1 = lunes … 6 = sábado. */
  workweek: number[]
}

export interface Database {
  settings: Settings
  employees: Employee[]
  holidays: Holiday[]
  requests: VacationRequest[]
  allowances: Allowance[]
}

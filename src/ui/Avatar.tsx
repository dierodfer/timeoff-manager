import type { Employee } from '../domain/types'

const TONES = 5

function initials(employee: Employee): string {
  return `${employee.firstName.at(0) ?? ''}${employee.lastName.at(0) ?? ''}`.toUpperCase()
}

function toneOf(id: string): number {
  let sum = 0
  for (const character of id) sum += character.codePointAt(0) ?? 0
  return sum % TONES
}

interface AvatarProps {
  readonly employee: Employee
  readonly size?: 'sm' | 'md' | 'lg'
}

const SIZE_CLASS = {
  sm: 'size-8 text-xs',
  md: 'size-10 text-[13px]',
  lg: 'size-11 text-sm',
} as const

export function Avatar({ employee, size = 'md' }: AvatarProps) {
  return (
    <span className={`avatar avatar-${toneOf(employee.id)} ${SIZE_CLASS[size]}`} aria-hidden="true">
      {initials(employee)}
    </span>
  )
}

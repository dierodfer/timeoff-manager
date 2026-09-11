const TONES = 5

// Solo lo que hace falta para pintar iniciales, no un Employee entero: así lo puede usar
// también la pantalla de acceso de una empresa, cuyos perfiles vienen de
// perfiles_para_acceso() y no tienen rol, PIN ni periodos de actividad.
interface AvatarPerson {
  id: string
  firstName: string
  lastName: string
}

function initials(person: AvatarPerson): string {
  return `${person.firstName.at(0) ?? ''}${person.lastName.at(0) ?? ''}`.toUpperCase()
}

function toneOf(id: string): number {
  let sum = 0
  for (const character of id) sum += character.codePointAt(0) ?? 0
  return sum % TONES
}

interface AvatarProps {
  readonly employee: AvatarPerson
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

import { HardDrive } from 'lucide-react'

export function LocalModeBadge() {
  return (
    <span
      className="chip chip-neutral"
      title="Los datos se guardan solo en este navegador. No hay servidor ni sincronización."
    >
      <HardDrive className="size-3.5" />
      Modo local
    </span>
  )
}

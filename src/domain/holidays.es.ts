import type { Holiday, HolidayScope } from './types'

// Fuentes: BOE-A-2025-21667 para 2026 y Decreto 84/2026 (BOJA) para 2027.
// Las dos fiestas locales de 2027 aún no estaban publicadas: faltan aquí.
type Seed = readonly [date: string, name: string, scope: HolidayScope]

const SEEDS: Record<number, readonly Seed[]> = {
  2026: [
    ['2026-01-01', 'Año Nuevo', 'nacional'],
    ['2026-01-06', 'Epifanía del Señor', 'nacional'],
    ['2026-01-20', 'Fiesta local de Algarrobo', 'algarrobo'],
    ['2026-02-28', 'Día de Andalucía', 'andalucia'],
    ['2026-04-02', 'Jueves Santo', 'andalucia'],
    ['2026-04-03', 'Viernes Santo', 'nacional'],
    ['2026-05-01', 'Fiesta del Trabajo', 'nacional'],
    ['2026-08-03', 'Fiesta local de Algarrobo', 'algarrobo'],
    ['2026-08-15', 'Asunción de la Virgen', 'nacional'],
    ['2026-10-12', 'Fiesta Nacional de España', 'nacional'],
    ['2026-11-02', 'Día siguiente a Todos los Santos', 'andalucia'],
    ['2026-12-07', 'Lunes siguiente al Día de la Constitución', 'andalucia'],
    ['2026-12-08', 'Inmaculada Concepción', 'nacional'],
    ['2026-12-25', 'Natividad del Señor', 'nacional'],
  ],
  2027: [
    ['2027-01-01', 'Año Nuevo', 'nacional'],
    ['2027-01-06', 'Epifanía del Señor', 'nacional'],
    ['2027-03-01', 'Día de Andalucía (trasladado)', 'andalucia'],
    ['2027-03-25', 'Jueves Santo', 'andalucia'],
    ['2027-03-26', 'Viernes Santo', 'nacional'],
    ['2027-05-01', 'Fiesta del Trabajo', 'nacional'],
    ['2027-08-16', 'Asunción de la Virgen (trasladada)', 'andalucia'],
    ['2027-10-12', 'Fiesta Nacional de España', 'nacional'],
    ['2027-11-01', 'Todos los Santos', 'nacional'],
    ['2027-12-06', 'Día de la Constitución Española', 'nacional'],
    ['2027-12-08', 'Inmaculada Concepción', 'nacional'],
    ['2027-12-25', 'Natividad del Señor', 'nacional'],
  ],
}

export const PRELOADED_YEARS = Object.keys(SEEDS).map(Number).sort()

export function hasPreloadedHolidays(year: number): boolean {
  return year in SEEDS
}

export function preloadedHolidays(year: number): Holiday[] {
  return (SEEDS[year] ?? []).map(([date, name, scope]) => ({
    id: `${scope}-${date}`,
    date,
    name,
    scope,
  }))
}

export const SCOPE_LABELS: Record<HolidayScope, string> = {
  nacional: 'Nacional',
  andalucia: 'Andalucía',
  algarrobo: 'Algarrobo',
}

import type { Holiday, HolidayScope } from './types'

/**
 * Festivos precargados para Algarrobo (Málaga): fiestas nacionales, fiestas de
 * la Comunidad Autónoma de Andalucía y las dos fiestas locales del municipio.
 *
 * Fuentes:
 * - 2026: Resolución de 17 de octubre de 2025 de la Dirección General de Trabajo
 *   (BOE-A-2025-21667) y relación de fiestas locales de Andalucía para 2026.
 * - 2027: Decreto 84/2026, de 29 de abril (BOJA núm. 84, de 5 de mayo de 2026).
 *
 * Las fiestas locales de 2027 todavía no estaban publicadas cuando se preparó
 * esta lista: los ayuntamientos las proponen tras la publicación del decreto y
 * se recogen después en una resolución posterior. Por eso el año 2027 se
 * precarga solo con las doce fiestas nacionales y autonómicas, y las dos
 * locales quedan pendientes de añadir desde Ajustes.
 */

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

/** Festivos oficiales conocidos para un año. Vacío si el año no está precargado. */
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

// Los mismos valores están prohibidos como organizations.slug en supabase/schema.sql:
// si una empresa se llamara igual que una de estas rutas, su slug sería inalcanzable,
// porque el primer tramo de la URL ya cae en modo local antes de mirar si es una empresa.
const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'mis-solicitudes',
  'planificacion',
  'solicitudes',
  'empleados',
  'asignacion',
  'ajustes',
])

/** El primer tramo de la URL es el slug de una empresa si no es una ruta local ni la raíz. */
export function isCompanySlug(firstSegment: string): boolean {
  return firstSegment !== '' && !RESERVED_SLUGS.has(firstSegment)
}

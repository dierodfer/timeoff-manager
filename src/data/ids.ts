// UUID v4 a mano con crypto.getRandomValues(), no crypto.randomUUID(): este último exige
// contexto seguro y el proyecto ya evita esa dependencia (ver randomSalt() en pin.ts). Las
// columnas de Supabase son `uuid`, así que el formato deja de ser un prefijo propio.
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0'))
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-')
}

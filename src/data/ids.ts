export function newId(prefix = 'id'): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  const random = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${prefix}_${random}`
}

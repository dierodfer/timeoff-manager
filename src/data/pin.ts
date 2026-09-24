const FALLBACK_PREFIX = 'fnv1a:'

function fallbackHash(input: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.codePointAt(index) ?? 0
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return FALLBACK_PREFIX + hash.toString(16).padStart(8, '0')
}

export function randomSalt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function subtleHash(pin: string, salt: string): Promise<string> {
  const input = `${salt}:${pin}`
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  // crypto.subtle solo existe en contextos seguros: al abrir la aplicación por
  // IP en la red local no está disponible.
  if (typeof crypto === 'undefined' || !crypto.subtle) return fallbackHash(`${salt}:${pin}`)
  return subtleHash(pin, salt)
}

/** Verifica con el mismo algoritmo con el que se creó `expectedHash` (lo dice su propio
 * formato: `fnv1a:` de reserva, o SHA-256 si no), no con el que elegiría hashPin() según el
 * contexto actual. Sin esto, un PIN creado en un contexto seguro (SHA-256) nunca validaría
 * luego en uno que no lo sea (recalcularía con el hash de reserva y no coincidiría), y al
 * revés — el usuario se quedaría fuera con el PIN correcto. Si el hash guardado es SHA-256 y
 * aquí no hay crypto.subtle, no hay forma de recalcularlo: no se puede confirmar. */
export async function verifyPin(pin: string, salt: string, expectedHash: string): Promise<boolean> {
  if (expectedHash.startsWith(FALLBACK_PREFIX)) {
    return fallbackHash(`${salt}:${pin}`) === expectedHash
  }
  if (typeof crypto === 'undefined' || !crypto.subtle) return false
  return (await subtleHash(pin, salt)) === expectedHash
}

export function isValidPin(pin: string): boolean {
  return pin === '' || /^\d{4,8}$/.test(pin)
}

export const PIN_RULE = 'El PIN debe tener entre 4 y 8 dígitos, o dejarse en blanco para no usarlo.'

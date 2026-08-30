/**
 * El PIN evita cambios de perfil accidentales; no es una medida de seguridad.
 * Los datos viven en el IndexedDB del navegador y cualquiera con acceso al
 * dispositivo puede leerlos. Se guarda el hash y no el PIN en claro para no
 * dejar el número a la vista en una copia de seguridad.
 */

const FALLBACK_PREFIX = 'fnv1a:'

function fallbackHash(input: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return FALLBACK_PREFIX + hash.toString(16).padStart(8, '0')
}

export function randomSalt(): string {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const bytes = crypto.getRandomValues(new Uint8Array(8))
    return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  }
  return Math.random().toString(16).slice(2, 18)
}

/**
 * SHA-256 sobre sal + PIN. `crypto.subtle` solo existe en contextos seguros
 * (https o localhost); si no está disponible se usa un hash simple para que la
 * aplicación siga funcionando, por ejemplo al abrirla por IP en la red local.
 */
export async function hashPin(pin: string, salt: string): Promise<string> {
  const input = `${salt}:${pin}`
  if (typeof crypto === 'undefined' || !crypto.subtle) return fallbackHash(input)

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function verifyPin(pin: string, salt: string, expectedHash: string): Promise<boolean> {
  return (await hashPin(pin, salt)) === expectedHash
}

export function isValidPin(pin: string): boolean {
  return /^\d{4,8}$/.test(pin)
}

export const PIN_RULE = 'El PIN debe tener entre 4 y 8 dígitos.'

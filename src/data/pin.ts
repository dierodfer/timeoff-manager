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

export async function hashPin(pin: string, salt: string): Promise<string> {
  const input = `${salt}:${pin}`
  // crypto.subtle solo existe en contextos seguros: al abrir la aplicación por
  // IP en la red local no está disponible.
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

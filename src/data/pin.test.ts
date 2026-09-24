import { describe, expect, it } from 'vitest'
import { hashPin, isValidPin, verifyPin } from './pin'

// Quita crypto.subtle temporalmente para simular un contexto no seguro (abrir la aplicación
// por IP en la red local, ver CLAUDE.md «Trampas conocidas»). Seguro de restaurar: hashPin()/
// verifyPin() deciden qué camino tomar de forma síncrona, antes de su primer await, así que ya
// han elegido cuando el finally de aquí abajo se ejecuta.
function withoutSubtle<T>(run: () => T): T {
  const original = crypto.subtle
  Object.defineProperty(crypto, 'subtle', { value: undefined, configurable: true })
  try {
    return run()
  } finally {
    Object.defineProperty(crypto, 'subtle', { value: original, configurable: true })
  }
}

describe('hashPin / verifyPin', () => {
  it('un PIN correcto valida y uno incorrecto no, con crypto.subtle disponible', async () => {
    const hash = await hashPin('1234', 'sal')
    expect(await verifyPin('1234', 'sal', hash)).toBe(true)
    expect(await verifyPin('9999', 'sal', hash)).toBe(false)
  })

  it('sin crypto.subtle, hashPin cae al hash de reserva y verifyPin lo reconoce', async () => {
    const hash = await withoutSubtle(() => hashPin('1234', 'sal'))
    expect(hash.startsWith('fnv1a:')).toBe(true)
    expect(await verifyPin('1234', 'sal', hash)).toBe(true)
  })

  it('un PIN creado sin crypto.subtle sigue validando cuando vuelve a estar disponible', async () => {
    // El caso que motivó el arreglo: verifyPin() ya no recalcula con hashPin() según el
    // contexto actual, sino con el algoritmo que dice el propio formato de expectedHash.
    const hash = await withoutSubtle(() => hashPin('1234', 'sal'))
    expect(await verifyPin('1234', 'sal', hash)).toBe(true)
  })

  it('un PIN creado con crypto.subtle no se puede confirmar sin él, pero no revienta', async () => {
    const hash = await hashPin('1234', 'sal')
    const result = await withoutSubtle(() => verifyPin('1234', 'sal', hash))
    expect(result).toBe(false)
  })
})

describe('isValidPin', () => {
  it('acepta la cadena vacía y 4-8 dígitos', () => {
    expect(isValidPin('')).toBe(true)
    expect(isValidPin('1234')).toBe(true)
    expect(isValidPin('12345678')).toBe(true)
  })

  it('rechaza menos de 4, más de 8, o algo que no sean dígitos', () => {
    expect(isValidPin('123')).toBe(false)
    expect(isValidPin('123456789')).toBe(false)
    expect(isValidPin('12ab')).toBe(false)
  })
})

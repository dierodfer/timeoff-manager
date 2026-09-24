import { describe, expect, it } from 'vitest'
import { summarizeDays } from './calendarGrid'

describe('summarizeDays', () => {
  it('sin días devuelve un guion', () => {
    expect(summarizeDays([])).toBe('—')
  })

  it('un único día suelto', () => {
    expect(summarizeDays(['2026-06-09'])).toBe('Jun: 9')
  })

  it('fusiona días consecutivos del mismo mes en un tramo', () => {
    expect(summarizeDays(['2026-06-09', '2026-06-10'])).toBe('Jun: 9–10')
  })

  it('varios tramos y días sueltos del mismo mes, separados por coma', () => {
    const days = ['2026-06-09', '2026-06-10', '2026-06-16', '2026-06-17']
    expect(summarizeDays(days)).toBe('Jun: 9–10, 16–17')
  })

  it('agrupa por mes, separados por «·», en orden cronológico', () => {
    const days = ['2026-08-04', '2026-06-09', '2026-08-07', '2026-08-08']
    expect(summarizeDays(days)).toBe('Jun: 9 · Ago: 4, 7–8')
  })

  it('un tramo consecutivo que cruza de mes se corta solo en dos', () => {
    // 30 y 31 de enero + 1 y 2 de febrero son cuatro días seguidos de calendario, pero se
    // agrupan por mes antes de fusionar: no deben quedar como un único tramo «30–33».
    const days = ['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02']
    expect(summarizeDays(days)).toBe('Ene: 30–31 · Feb: 1–2')
  })

  it('no le importa el orden de entrada', () => {
    const days = ['2026-06-17', '2026-06-09', '2026-06-16', '2026-06-10']
    expect(summarizeDays(days)).toBe('Jun: 9–10, 16–17')
  })
})

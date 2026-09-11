import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: process.env.BASE_PATH ?? '/timeoff-manager/',
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Zona horaria con desfase POSITIVO a propósito, y además la de los usuarios: en UTC
    // una vuelta a la aritmética de hora local en domain/dates.ts pasaría los tests sin
    // que nadie se entere, y con desfase negativo también (la medianoche local cae el
    // mismo día en UTC). Aquí no: `new Date(2026, 0, 1)` se va al 31 de diciembre
    // anterior, que es exactamente el bug que esa capa existe para evitar.
    env: { TZ: 'Europe/Madrid' },
  },
})

import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Solo en build, no en npm run dev: el HMR de Vite necesita eval y estilos inyectados que una
// CSP estricta bloquearía, y como index.html se copia tal cual a dist/, cualquier relajación
// que se le hiciera para que dev funcionara viajaría también a producción. apply: 'build' evita
// ese conflicto sin tocar el fichero fuente.
function contentSecurityPolicy(): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml() {
      const ref = process.env.VITE_SUPABASE_PROJECT_REF
      // Sin ref (modo local puro, sin Supabase configurado) esta cláusula queda vacía: no hay
      // ningún origen de empresa al que conectar.
      const supabase = ref ? ` https://${ref}.supabase.co wss://${ref}.supabase.co` : ''
      const csp = [
        "default-src 'self'",
        "script-src 'self'",
        // 'unsafe-inline' hace falta: varios componentes pintan color/ancho/sombra dinámicos con
        // style={{...}} (BalanceCard, Metric, MonthCalendar, Toasts…), que no tiene equivalente
        // sin inline — bloquear scripts (el vector real de XSS) es lo que importa aquí.
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self'",
        `connect-src 'self'${supabase}`,
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ')
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: csp },
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}

export default defineConfig({
  base: process.env.BASE_PATH ?? '/timeoff-manager/',
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
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

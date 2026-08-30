import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// El despliegue es GitHub Pages en https://<usuario>.github.io/timeoff-manager/,
// por lo que la aplicación se sirve bajo un subdirectorio y no en la raíz del dominio.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/timeoff-manager/',
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})

export type Theme = 'light' | 'dark'

export const THEME_KEY = 'timeoff:theme'

export function readTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // Un navegador con el almacenamiento bloqueado no debe tumbar la aplicación:
    // el tema se aplica igual, solo que no se recuerda al recargar.
  }
}

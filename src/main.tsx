import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { AppProvider } from './state/AppStore'
import './index.css'

// HashRouter en lugar de BrowserRouter: GitHub Pages sirve ficheros estáticos y
// no sabe reescribir rutas, así que un refresco en /solicitudes daría un 404.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <HashRouter>
        <App />
      </HashRouter>
    </AppProvider>
  </StrictMode>,
)

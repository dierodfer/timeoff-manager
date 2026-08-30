import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { AppProvider } from './state/AppStore'
import { ErrorBoundary } from './ui/ErrorBoundary'
import './index.css'

// HashRouter: GitHub Pages no reescribe rutas y un refresco daría un 404.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AppProvider>
        <HashRouter>
          <App />
        </HashRouter>
      </AppProvider>
    </ErrorBoundary>
  </StrictMode>,
)

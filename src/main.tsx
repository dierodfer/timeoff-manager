import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { isCompanySlug } from './domain/orgSlug'
import { ErrorBoundary } from './ui/ErrorBoundary'
import './index.css'

// El slug decide el basename del router antes de montar nada: se lee el hash a mano, sin pasar
// por ningún hook de router (HashRouter no reescribe rutas: un refresco daría 404).
function readCompanySlug(): string | null {
  const hash = window.location.hash.slice(1)
  const firstSegment = hash.split('/')[1] ?? ''
  return isCompanySlug(firstSegment) ? firstSegment : null
}

const companySlug = readCompanySlug()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <HashRouter basename={companySlug ? `/${companySlug}` : '/'}>
        <App companySlug={companySlug} />
      </HashRouter>
    </ErrorBoundary>
  </StrictMode>,
)

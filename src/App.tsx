import { lazy, Suspense } from 'react'
import { AuthenticatedRoutes } from './AppRoutes'
import { indexedDbRepository } from './data/indexedDbRepository'
import { SignIn } from './pages/SignIn'
import { AppProvider } from './state/AppStore'
import { useApp } from './state/appContext'
import { Toasts } from './ui/Toasts'

// Perezosas: la primera configuración y la puerta de una empresa conectada a Supabase. Quien
// entra en modo local no descarga el cliente de Supabase, que no puede abrir; quien entra por
// /<slug> no descarga el formulario de primera configuración, que no va a usar.
const CompanyGate = lazy(() =>
  import('./pages/CompanyGate').then((m) => ({ default: m.CompanyGate })),
)
const FirstRun = lazy(() => import('./pages/FirstRun').then((m) => ({ default: m.FirstRun })))

interface AppProps {
  /**
   * El slug de empresa, ya decidido por main.tsx antes de montar nada (isCompanySlug() sobre el
   * hash crudo): `null` es modo local. Es la misma información que fijó el `basename` del
   * `HashRouter`, así que aquí no hace falta volver a mirar la URL.
   */
  readonly companySlug: string | null
}

export default function App({ companySlug }: AppProps) {
  if (companySlug !== null) {
    return (
      <Suspense fallback={<Splash />}>
        <CompanyGate slug={companySlug} />
      </Suspense>
    )
  }
  return (
    <AppProvider repository={indexedDbRepository} mode="local">
      <LocalApp />
      <Toasts />
    </AppProvider>
  )
}

function LocalApp() {
  const { status, database, currentUser } = useApp()

  if (status === 'loading') return <Splash />
  if (!database) {
    return (
      <Suspense fallback={<Splash />}>
        <FirstRun />
      </Suspense>
    )
  }
  if (!currentUser) return <SignIn />

  return <AuthenticatedRoutes />
}

export function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <p className="text-sm text-[var(--color-ink-muted)]">Cargando…</p>
    </div>
  )
}

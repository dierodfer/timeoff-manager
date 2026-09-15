import { lazy, Suspense } from 'react'
import { AuthenticatedRoutes } from './AppRoutes'
import { indexedDbRepository } from './data/indexedDbRepository'
import { SignIn } from './pages/SignIn'
import { AppProvider } from './state/AppStore'
import { useApp } from './state/appContext'
import { Toasts } from './ui/Toasts'

// Perezosas: quien entra en local no descarga el cliente de Supabase, y viceversa.
const CompanyGate = lazy(() =>
  import('./pages/CompanyGate').then((m) => ({ default: m.CompanyGate })),
)
const FirstRun = lazy(() => import('./pages/FirstRun').then((m) => ({ default: m.FirstRun })))

interface AppProps {
  /** Ya decidido por main.tsx antes de montar nada; `null` es modo local. */
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

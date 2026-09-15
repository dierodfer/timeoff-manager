import type { PostgrestError, Session, SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Splash } from '../App'
import { AuthenticatedRoutes } from '../AppRoutes'
import { getSupabaseClient } from '../data/supabaseClient'
import { createSupabaseRepository } from '../data/supabaseRepository'
import { AppProvider } from '../state/AppStore'
import { useApp } from '../state/appContext'
import { Avatar } from '../ui/Avatar'
import { Toasts } from '../ui/Toasts'

interface Profile {
  id: string
  first_name: string
  last_name: string
  email: string
}

interface AccesoRow {
  org_name: string
  id: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
}

type LoadState =
  | { kind: 'cargando' }
  | { kind: 'error'; message: string }
  | { kind: 'no-encontrada' }
  | { kind: 'lista'; orgName: string; profiles: Profile[] }

function avatarPerson(profile: Profile) {
  return { id: profile.id, firstName: profile.first_name, lastName: profile.last_name }
}

interface CompanyGateProps {
  readonly slug: string
}

// Se remonta con key={slug}:{reloadToken} (la misma trampa de MobileMonth en CLAUDE.md) en vez
// de resetear el estado a mano dentro del efecto.
export function CompanyGate({ slug }: CompanyGateProps) {
  const [reloadToken, setReloadToken] = useState(0)
  return (
    <CompanyGateScreen
      key={`${slug}:${reloadToken}`}
      slug={slug}
      onRetry={() => setReloadToken((current) => current + 1)}
    />
  )
}

interface CompanyGateScreenProps {
  readonly slug: string
  readonly onRetry: () => void
}

function CompanyGateScreen({ slug, onRetry }: CompanyGateScreenProps) {
  // Llamada sincrónica y estable (getSupabaseClient() memoiza), no un valor que dependa de un
  // efecto: si falta, se decide directamente en el render de más abajo, sin pasar por `state`.
  const supabase = getSupabaseClient()

  const [state, setState] = useState<LoadState>({ kind: 'cargando' })
  const [selected, setSelected] = useState<Profile | null>(null)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [busy, setBusy] = useState(false)

  // La sesión de Supabase Auth es la fuente de verdad de «ha entrado», no un estado propio.
  const [session, setSession] = useState<Session | null>(null)
  const [sessionChecked, setSessionChecked] = useState(false)

  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      setSession(data.session)
      setSessionChecked(true)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [supabase])

  useEffect(() => {
    if (!supabase || !sessionChecked || session) return

    let cancelled = false

    const load = async () => {
      try {
        const response: { data: AccesoRow[] | null; error: PostgrestError | null } =
          await supabase.rpc('perfiles_para_acceso', { p_slug: slug })
        if (cancelled) return
        if (response.error) {
          setState({ kind: 'error', message: response.error.message })
          return
        }
        const rows = response.data ?? []
        if (rows.length === 0) {
          setState({ kind: 'no-encontrada' })
          return
        }
        const profiles = rows.filter(
          (row): row is AccesoRow & Profile => row.id !== null && row.email !== null,
        )
        setState({ kind: 'lista', orgName: rows[0].org_name, profiles })
      } catch (error) {
        if (cancelled) return
        setState({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Fallo desconocido.',
        })
      }
    }
    void load()

    return () => {
      cancelled = true
    }
  }, [slug, supabase, sessionChecked, session])

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase || !selected) return
    setBusy(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: selected.email,
        password,
      })
      if (error) {
        setPassword('')
        setPasswordError('Contraseña incorrecta.')
        return
      }
      // onAuthStateChange actualiza `session` solo: no hace falta tocar nada más aquí.
    } finally {
      setBusy(false)
    }
  }

  if (!supabase) {
    return (
      <Centered>
        <h1 className="text-2xl">/{slug}</h1>
        <p className="mt-2 text-[15px] text-[var(--color-ink-muted)]">
          {'Esta URL es de una empresa, pero el despliegue no tiene configurado Supabase ('}
          <code className="tabular">VITE_SUPABASE_PROJECT_REF</code>
          {' / '}
          <code className="tabular">VITE_SUPABASE_ANON_KEY</code>
          {').'}
        </p>
      </Centered>
    )
  }

  if (!sessionChecked) {
    return <Splash />
  }

  if (session) {
    return <CompanyWorkspace client={supabase} />
  }

  if (state.kind === 'cargando') {
    return (
      <Centered>
        <p className="text-sm text-[var(--color-ink-muted)]">Cargando…</p>
      </Centered>
    )
  }

  if (state.kind === 'error') {
    return (
      <Centered>
        <h1 className="text-2xl">/{slug}</h1>
        <p className="mt-2 text-[15px] text-[var(--color-rejected)]">{state.message}</p>
        <button type="button" className="btn btn-secondary mt-4" onClick={onRetry}>
          Reintentar
        </button>
      </Centered>
    )
  }

  if (state.kind === 'no-encontrada') {
    return (
      <Centered>
        <h1 className="text-2xl">/{slug}</h1>
        <p className="mt-2 text-[15px] text-[var(--color-ink-muted)]">
          No se encontró ninguna empresa en esta dirección.
        </p>
      </Centered>
    )
  }

  const profileList =
    state.profiles.length === 0 ? (
      <p className="card mt-6 p-6 text-sm text-[var(--color-ink-muted)]">
        Esta empresa todavía no tiene ningún perfil configurado para entrar.
      </p>
    ) : (
      <ul className="card mt-6 divide-y divide-[var(--color-hairline)] overflow-hidden">
        {state.profiles.map((profile) => (
          <li key={profile.id}>
            <button
              type="button"
              onClick={() => setSelected(profile)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-[var(--color-surface-sunken)]"
            >
              <Avatar employee={avatarPerson(profile)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium">
                  {profile.first_name} {profile.last_name}
                </span>
              </span>
              <span className="text-[var(--color-ink-muted)]">›</span>
            </button>
          </li>
        ))}
      </ul>
    )

  return (
    <Centered>
      <h1 className="text-2xl">{state.orgName}</h1>
      <p className="mt-1 text-[15px] text-[var(--color-ink-muted)]">
        {selected ? 'Introduce tu contraseña para continuar.' : 'Elige tu perfil para continuar.'}
      </p>

      {!selected ? (
        profileList
      ) : (
        <form onSubmit={(event) => void onSubmit(event)} className="card mt-6 space-y-4 p-6">
          <div className="flex items-center gap-3">
            <Avatar employee={avatarPerson(selected)} />
            <p className="text-[15px] font-medium">
              {selected.first_name} {selected.last_name}
            </p>
          </div>

          <div>
            <label className="label" htmlFor="password">
              Contraseña
            </label>
            <input
              id="password"
              className="field"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value)
                setPasswordError('')
              }}
            />
            {passwordError && (
              <p className="mt-1 text-xs text-[var(--color-rejected)]">{passwordError}</p>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-secondary flex-1"
              onClick={() => {
                setSelected(null)
                setPassword('')
                setPasswordError('')
              }}
            >
              Cambiar
            </button>
            <button type="submit" className="btn btn-primary flex-1" disabled={busy}>
              Entrar
            </button>
          </div>
        </form>
      )}
    </Centered>
  )
}

interface CompanyWorkspaceProps {
  readonly client: SupabaseClient
}

// createSupabaseRepository() se memoiza: ver CLAUDE.md, «Trampas conocidas».
function CompanyWorkspace({ client }: CompanyWorkspaceProps) {
  const repository = useMemo(() => createSupabaseRepository(client), [client])
  return (
    <AppProvider repository={repository} mode="empresa" supabase={client}>
      <CompanyScreen />
      <Toasts />
    </AppProvider>
  )
}

function CompanyScreen() {
  const { status, database, currentUser, error, signOut } = useApp()

  if (status === 'loading') return <Splash />

  if (status === 'error') {
    return (
      <Centered>
        <h1 className="text-2xl">No se pudo cargar la empresa</h1>
        <p className="mt-2 text-[15px] text-[var(--color-rejected)]">{error}</p>
        <button type="button" className="btn btn-secondary mt-4" onClick={signOut}>
          Salir
        </button>
      </Centered>
    )
  }

  if (!database || !currentUser) {
    return (
      <Centered>
        <h1 className="text-2xl">Sin acceso</h1>
        <p className="mt-2 text-[15px] text-[var(--color-ink-muted)]">
          Tu usuario no está vinculado a ninguna ficha de esta empresa.
        </p>
        <button type="button" className="btn btn-secondary mt-4" onClick={signOut}>
          Salir
        </button>
      </Centered>
    )
  }

  return <AuthenticatedRoutes />
}

function Centered({ children }: { readonly children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      {children}
    </div>
  )
}

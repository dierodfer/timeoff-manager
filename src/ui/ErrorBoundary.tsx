import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Fallo no controlado:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-5 py-10">
        <h1 className="text-2xl">Algo ha ido mal</h1>
        <p className="mt-2 text-[15px] text-[var(--color-ink-muted)]">
          La aplicación se ha detenido por un error inesperado. Tus datos siguen guardados en este
          navegador; recargar suele bastar.
        </p>

        <pre className="card mt-5 overflow-x-auto p-4 text-xs text-[var(--color-ink-soft)]">
          {error.message}
        </pre>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => window.location.reload()}
          >
            Recargar
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => this.setState({ error: null })}
          >
            Volver a intentarlo
          </button>
        </div>
      </div>
    )
  }
}

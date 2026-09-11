import { Component, type ErrorInfo, type ReactNode } from 'react'
import { indexedDbRepository } from '../data/indexedDbRepository'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
  confirming: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, confirming: false }

  static getDerivedStateFromError(error: Error): State {
    return { error, confirming: false }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Fallo no controlado:', error, info.componentStack)
  }

  // Habla con el repositorio directamente porque este componente envuelve al AppProvider:
  // cuando se pinta, el contexto puede no existir todavía o ser justo lo que está roto.
  private borrarYEmpezarDeCero = () => {
    void indexedDbRepository
      .clear()
      .catch((error: unknown) => console.error('No se pudieron borrar los datos:', error))
      .finally(() => {
        sessionStorage.clear()
        window.location.reload()
      })
  }

  render() {
    const { error, confirming } = this.state
    if (!error) return this.props.children

    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-5 py-10">
        <h1 className="text-2xl">Algo ha ido mal</h1>
        <p className="mt-2 text-[15px] text-[var(--color-ink-muted)]">
          La aplicación se ha detenido por un error inesperado. Prueba a recargar; si vuelve a
          fallar, es que los datos guardados en este navegador están dañados y hay que empezar de
          cero.
        </p>

        <pre className="card mt-5 overflow-x-auto p-4 text-xs text-[var(--color-ink-soft)]">
          {error.message}
        </pre>

        {confirming ? (
          <div className="card mt-5 space-y-3 p-4">
            <p className="text-sm">
              Se borrarán los empleados, las solicitudes, los festivos y los ajustes de este
              navegador. No se puede deshacer.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-danger" onClick={this.borrarYEmpezarDeCero}>
                Sí, borrar y empezar de cero
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => this.setState({ confirming: false })}
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 flex flex-wrap gap-2">
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
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => this.setState({ confirming: true })}
            >
              Empezar de cero
            </button>
          </div>
        )}
      </div>
    )
  }
}

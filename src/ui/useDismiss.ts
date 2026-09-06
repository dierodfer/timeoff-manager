import { useEffect } from 'react'

/** Cierra un popover al pulsar fuera de él o con Escape. `isInside` decide qué es «dentro». */
export function useDismiss(
  open: boolean,
  isInside: (target: HTMLElement) => boolean,
  close: () => void,
) {
  useEffect(() => {
    if (!open) return

    const onClick = (event: MouseEvent) => {
      if (!isInside(event.target as HTMLElement)) close()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // Escape consumido para que no burbujee hasta el Modal, que también cierra con Escape.
      event.preventDefault()
      close()
    }

    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKeyDown)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
}

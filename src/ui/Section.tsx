import type { ReactNode } from 'react'

export function Section({
  title,
  description,
  action,
  children,
}: {
  readonly title?: string
  readonly description?: string
  readonly action?: ReactNode
  readonly children: ReactNode
}) {
  return (
    <section>
      {(title || action) && (
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2 px-1">
          {title && (
            <div>
              <h2 className="text-[13px] font-semibold tracking-wide text-[var(--color-ink-muted)] uppercase">
                {title}
              </h2>
              {description && (
                <p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">{description}</p>
              )}
            </div>
          )}
          {action}
        </div>
      )}
      <div className="card divide-y divide-[var(--color-hairline)] overflow-hidden">{children}</div>
    </section>
  )
}

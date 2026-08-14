import type { ReactNode } from 'react';

interface EmptyStateProps {
  /** What is not here, in the person's terms — "No bookings yet", not "Empty". */
  title: ReactNode;
  /** Why it might be empty, or what to do about it. */
  description?: ReactNode;
  /** The way out: usually the button that creates the first one. */
  action?: ReactNode;
  className?: string;
}

/**
 * The "nothing here" state.
 *
 * <p>Most screens rendered a bare sentence, which at a glance is indistinguishable from a page
 * that failed to load — the reason an empty list needs a deliberate treatment rather than an
 * absence of one. `role="status"` so the emptiness is announced after a filter change instead of
 * leaving a screen reader on a table that silently lost its rows.
 */
export function EmptyState({ title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div
      role="status"
      className={[
        'rounded-card border border-dashed border-ink-300 bg-surface-sunken px-6 py-10 text-center',
        className,
      ].join(' ')}
    >
      <p className="font-medium text-felt-900">{title}</p>
      {description && (
        <p className="mx-auto mt-1.5 max-w-md text-sm text-fg-muted">{description}</p>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

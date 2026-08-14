import type { ReactNode } from 'react';

type Tone = 'default' | 'warning' | 'danger';

interface PanelProps {
  /** Anchor target, for pages long enough to need jump links. */
  id?: string;
  /** Rendered as an h2. Omit for a panel that is only a container. */
  title?: ReactNode;
  description?: ReactNode;
  /** Controls on the title row. */
  actions?: ReactNode;
  tone?: Tone;
  /** Drop the inner padding — for a panel wrapping a table or list that pads itself. */
  flush?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * A bordered surface. The single most repeated thing in the app.
 *
 * <p>`rounded-card border border-ink-200 bg-white p-6 shadow-card` was copy-pasted across a
 * dozen files, which meant a change to the card treatment was a dozen edits and, in practice,
 * never happened — so the cards drifted. The tinted tones fold in the settle and cancel
 * panels, which were the same markup with a different pair of colours.
 */
const TONE_CLASSES: Record<Tone, string> = {
  default: 'border-line bg-surface',
  warning: 'border-amber-200 bg-amber-50',
  danger: 'border-rose-200 bg-rose-50',
};

const TITLE_CLASSES: Record<Tone, string> = {
  default: 'text-felt-900',
  warning: 'text-amber-900',
  danger: 'text-rose-900',
};

export function Panel({
  id,
  title,
  description,
  actions,
  tone = 'default',
  flush = false,
  className = '',
  children,
}: PanelProps) {
  return (
    <section
      id={id}
      className={[
        'rounded-card border shadow-card',
        TONE_CLASSES[tone],
        flush ? '' : 'p-5 sm:p-6',
        className,
      ].join(' ')}
    >
      {(title || actions) && (
        <div
          className={[
            'flex flex-wrap items-start justify-between gap-3',
            flush ? 'p-5 pb-0 sm:p-6 sm:pb-0' : '',
          ].join(' ')}
        >
          <div className="min-w-0">
            {title && (
              <h2 className={`font-semibold tracking-tight ${TITLE_CLASSES[tone]}`}>{title}</h2>
            )}
            {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

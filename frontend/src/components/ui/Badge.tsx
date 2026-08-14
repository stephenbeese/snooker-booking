import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'positive' | 'pending' | 'negative' | 'accent';

interface BadgeProps {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}

/**
 * A small status pill.
 *
 * <p>Tones are named for what they mean, not what colour they are: a booking's "confirmed" and a
 * table's "in service" are both `positive` and must look alike, which is exactly what gets lost
 * when each caller picks its own green. The domain badges (StatusBadge, PaymentBadge) keep their
 * own mapping from a domain enum to a tone and render through this.
 */
const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-ink-200 text-ink-700',
  positive: 'bg-felt-100 text-felt-900',
  pending: 'bg-amber-100 text-amber-900',
  negative: 'bg-rose-100 text-rose-900',
  accent: 'bg-brass-200 text-felt-950',
};

export function Badge({ tone = 'neutral', className = '', children }: BadgeProps) {
  return (
    <span
      className={[
        'inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium',
        TONE_CLASSES[tone],
        className,
      ].join(' ')}
    >
      {children}
    </span>
  );
}

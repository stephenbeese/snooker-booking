import type { ReactNode } from 'react';

type Tone = 'info' | 'success' | 'warning' | 'danger';

interface AlertProps {
  tone?: Tone;
  /**
   * Override how this is announced.
   *
   * <p>`'alert'` interrupts; `'status'` waits for a pause; `'none'` is silent. Each tone has the
   * right default (below) — pass this only for a genuine exception, such as a warning that is
   * part of the page on load rather than a response to something the person just did.
   */
  live?: 'alert' | 'status' | 'none';
  className?: string;
  children: ReactNode;
}

/**
 * A message banner.
 *
 * <p>The same `rounded-card border border-rose-200 bg-rose-50 p-4` block was hand-written on at
 * least four pages, each with slightly different padding and a different decision about whether
 * to set `role="alert"` — so some errors were announced and others were silently rendered.
 * Deciding it once here is the point.
 */
const TONE_CLASSES: Record<Tone, string> = {
  info: 'border-felt-200 bg-felt-50 text-felt-900',
  success: 'border-felt-200 bg-felt-50 text-felt-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  danger: 'border-rose-200 bg-rose-50 text-rose-800',
};

/**
 * How each tone is announced by default.
 *
 * <p>The success/failure split is the important one and is deliberately not symmetric. A failure
 * is `alert`, which interrupts: the person needs to know before they carry on. A success is
 * `status`, which waits for a pause, because nothing is wrong and cutting them off to say so is
 * worse than saying it a moment later. Several tests turn on exactly this distinction — asserting
 * a confirmation appears as `status` while an error appears as `alert`, and in one case that a
 * `status` is absent when a save failed.
 */
const ROLE_BY_TONE: Record<Tone, 'alert' | 'status' | 'none'> = {
  info: 'none',
  success: 'status',
  warning: 'alert',
  danger: 'alert',
};

export function Alert({ tone = 'info', live, className = '', children }: AlertProps) {
  const role = live ?? ROLE_BY_TONE[tone];

  return (
    <div
      role={role === 'none' ? undefined : role}
      className={['rounded-card border px-4 py-3 text-sm', TONE_CLASSES[tone], className].join(' ')}
    >
      {children}
    </div>
  );
}

import { useId } from 'react';
import type { SelectHTMLAttributes } from 'react';

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
}

/**
 * A labelled select, matching {@link TextField} exactly.
 *
 * <p>Exists because the same `<select>` markup — the identical ring, padding and focus classes —
 * had been copy-pasted into five screens, so restyling a control meant finding all five and any
 * that had drifted. The label is always present and always associated by id, for the same
 * reason as TextField.
 *
 * <p>A native `<select>` underneath, deliberately. A JS-rendered listbox would have to
 * reimplement keyboard interaction, typeahead and the mobile picker, and would be worse than
 * the platform's at all three — most of all on a phone, which is where staff use this.
 */
export function Select({ label, error, hint, className = '', children, ...props }: SelectProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ');

  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-felt-900">
        {label}
      </label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={[
          'mt-1.5 block w-full rounded-lg bg-white px-3.5 py-2.5 text-sm text-ink-900',
          'transition-shadow',
          'ring-1 ring-inset focus:ring-2 focus:ring-inset focus:outline-none',
          error ? 'ring-rose-400 focus:ring-rose-600' : 'ring-ink-300 focus:ring-felt-600',
        ].join(' ')}
        {...props}
      >
        {children}
      </select>
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-xs text-ink-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1.5 text-xs font-medium text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}

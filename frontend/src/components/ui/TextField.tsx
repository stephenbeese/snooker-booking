import { useId } from 'react';
import type { InputHTMLAttributes } from 'react';

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
}

/**
 * A labelled input.
 *
 * <p>The label is always present and always associated by id — never a placeholder standing in
 * for one. A placeholder disappears the moment someone starts typing, which leaves screen
 * readers with an unlabelled field and everyone else unable to check what they were asked for.
 */
export function TextField({ label, error, hint, className = '', ...props }: TextFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ');

  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-felt-900">
        {label}
      </label>
      <input
        id={id}
        // Announces the invalid state to assistive technology, not just to sighted users
        // via the red ring.
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={[
          'mt-1.5 block w-full rounded-lg bg-white px-3.5 py-2.5 text-sm text-ink-900',
          'transition-shadow placeholder:text-ink-400',
          // The ring is the border. focus:outline-none would strip the only focus
          // indicator, so the ring thickens instead — visible without a system outline
          // fighting the rounded corners.
          'ring-1 ring-inset focus:ring-2 focus:ring-inset focus:outline-none',
          error ? 'ring-rose-400 focus:ring-rose-600' : 'ring-ink-300 focus:ring-felt-600',
        ].join(' ')}
        {...props}
      />
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

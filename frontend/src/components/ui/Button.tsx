import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-felt-700 text-white hover:bg-felt-900 focus-visible:outline-felt-700',
  secondary:
    'bg-white text-felt-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus-visible:outline-felt-700',
  danger: 'bg-rose-700 text-white hover:bg-rose-800 focus-visible:outline-rose-700',
};

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  return (
    <button
      // Buttons default to type="submit" inside a form, which silently submits when you
      // meant to do something else. Callers opt in explicitly.
      type={props.type ?? 'button'}
      className={[
        'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium',
        'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2',
        // Not just opacity: a disabled control must not look merely faded, and the cursor
        // should say so before the click.
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT_CLASSES[variant],
        className,
      ].join(' ')}
      {...props}
    />
  );
}

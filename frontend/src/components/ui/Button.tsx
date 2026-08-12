import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  // The shadow carries the hover state as much as the colour does, so the affordance
  // survives for anyone who cannot distinguish the two greens.
  primary: 'bg-felt-700 text-white shadow-sm hover:bg-felt-800 hover:shadow-card active:bg-felt-900',
  secondary:
    'bg-white text-felt-900 ring-1 ring-inset ring-ink-300 hover:bg-ink-50 hover:ring-ink-400',
  ghost: 'text-felt-800 hover:bg-felt-50',
  danger: 'bg-rose-700 text-white shadow-sm hover:bg-rose-800',
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'gap-1.5 rounded-lg px-3 py-1.5 text-sm',
  md: 'gap-2 rounded-lg px-4 py-2.5 text-sm',
  lg: 'gap-2 rounded-xl px-6 py-3 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      // Buttons default to type="submit" inside a form, which silently submits when you
      // meant to do something else. Callers opt in explicitly.
      type={props.type ?? 'button'}
      className={[
        'inline-flex items-center justify-center font-medium',
        'transition-all duration-150',
        // Not just opacity: a disabled control must not look merely faded, and the cursor
        // should say so before the click.
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none',
        SIZE_CLASSES[size],
        VARIANT_CLASSES[variant],
        className,
      ].join(' ')}
      {...props}
    />
  );
}

import type { ReactNode } from 'react';

type Width = 'sm' | 'detail' | 'md' | 'lg';

interface PageShellProps {
  /** Rendered as the page's h1. Omit only for pages that supply their own heading. */
  title?: ReactNode;
  /** A sentence under the title saying what the page is for. */
  description?: ReactNode;
  /** Controls sitting on the title row — usually a Button or a link back. */
  actions?: ReactNode;
  width?: Width;
  children: ReactNode;
}

/**
 * The page frame: one width, one padding rhythm, one heading scale.
 *
 * <p>Before this existed the app used five different `max-w-*` values, `sm:px-6` on some pages
 * and not others, and `text-3xl` on seven pages against `text-2xl` on eight — none of it
 * deliberate, all of it invisible in isolation and obvious once you move between two screens.
 * A page picks a width from the three below; it does not invent one.
 */
const WIDTH_CLASSES: Record<Width, string> = {
  /** Forms and single-column reading: sign in, your profile. */
  sm: 'max-w-2xl',
  /** One record and its panels — a booking, a customer. Wider than a form, narrower than a list. */
  detail: 'max-w-4xl',
  /** The default. Most list screens. */
  md: 'max-w-6xl',
  /** Wide data only — the diary grid, where every extra column earns its keep. */
  lg: 'max-w-7xl',
};

export function PageShell({
  title,
  description,
  actions,
  width = 'md',
  children,
}: PageShellProps) {
  return (
    <div className={`mx-auto ${WIDTH_CLASSES[width]} px-4 py-10 sm:px-6`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            {title && (
              <h1 className="text-2xl font-semibold tracking-tight text-felt-900 sm:text-3xl">
                {title}
              </h1>
            )}
            {description && <p className="mt-2 text-fg-muted">{description}</p>}
          </div>
          {/* shrink-0 so a long title wraps rather than squashing the actions into
              unreadable slivers. */}
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

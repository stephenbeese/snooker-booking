interface SkeletonProps {
  /** A Tailwind height class, e.g. `h-64`. */
  className?: string;
  /** Repeat the block this many times, stacked. */
  count?: number;
  /** What is loading, for screen readers. Only the first Skeleton on a page should set it. */
  label?: string;
}

/**
 * A loading placeholder.
 *
 * <p>`aria-hidden` on the blocks themselves: they are shape, not content, and a screen reader
 * announcing three grey rectangles is worse than silence. The optional `label` renders one
 * polite live message instead, which is what someone actually needs to hear.
 */
export function Skeleton({ className = 'h-24', count = 1, label }: SkeletonProps) {
  return (
    <>
      {label && (
        <p role="status" className="sr-only">
          {label}
        </p>
      )}
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          aria-hidden
          className={`animate-pulse rounded-card bg-ink-100 ${index > 0 ? 'mt-3' : ''} ${className}`}
        />
      ))}
    </>
  );
}

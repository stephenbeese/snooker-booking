/**
 * The mark: a cue ball and a red, on baize.
 *
 * Inline SVG rather than a file, because it is tiny and appears in the header on every
 * page — a separate request (and its flash of nothing) costs more than the markup.
 */
export function Logo({ className = '' }: { className?: string }) {
  return (
    // aria-hidden, not a labelled image: the mark always sits beside the club's name in
    // text, so announcing it would just read the name twice.
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <circle cx="16" cy="16" r="15" className="fill-felt-800" />
      <circle cx="12" cy="13" r="6" className="fill-white" />
      <circle cx="21" cy="21" r="4.5" className="fill-rose-600" />
      {/* A soft highlight, so the balls read as spheres rather than flat discs. */}
      <circle cx="10" cy="11" r="1.6" className="fill-white/70" />
    </svg>
  );
}

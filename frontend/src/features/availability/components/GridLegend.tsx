interface GridLegendProps {
  /** Shown as a closing note, e.g. "23:00". Omitted where the day publishes no closing time. */
  closingTime?: string | null;
}

const ITEMS = [
  { label: 'Available', className: 'bg-felt-100' },
  // A wide swatch, not a square: the selection is now a bar across several cells, and a
  // square here would describe something the grid no longer draws.
  { label: 'Your booking', className: 'bg-felt-700 w-7' },
  // "Doesn't fit" retired with the fade it described. A cell used to dim when it could not hold
  // the duration currently in the dropdown, which no longer happens: a click sets the start and
  // the second click sets the length, so any free cell is a valid place to begin. The one case
  // left — nothing fits here at all, however short — is what "Too late to book" covers.
  { label: 'Too late to book', className: 'bg-felt-50 border border-felt-100' },
  { label: 'Booked', className: 'bg-rose-100' },
  { label: 'Maintenance', className: 'bg-amber-100' },
  { label: 'Unavailable', className: 'bg-ink-100' },
];

export function GridLegend({ closingTime }: GridLegendProps = {}) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-fg-muted">
      {ITEMS.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span aria-hidden className={`inline-block h-3 w-3 rounded ${item.className}`} />
          {item.label}
        </li>
      ))}
      {/* Named in words as well as hatched in the grid, so the closing time is legible
          without having to scroll to the far end of a full day's timeline. */}
      {closingTime && (
        <li className="flex items-center gap-1.5 font-medium text-ink-600">
          <span
            aria-hidden
            className="inline-block h-3 w-3 rounded border-l-2 border-ink-300 bg-[repeating-linear-gradient(135deg,var(--color-ink-100)_0px,var(--color-ink-100)_3px,transparent_3px,transparent_6px)]"
          />
          Closes {closingTime}
        </li>
      )}
    </ul>
  );
}

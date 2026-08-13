import { useEffect, useId, useRef, useState } from 'react';

interface Option {
  value: string;
  /** Shown in the list and read out. */
  label: string;
  /** Optional shorter form for the closed button. Defaults to `label`. */
  shortLabel?: string;
}

interface CheckboxDropdownProps {
  legend: string;
  options: Option[];
  selected: string[];
  onChange: (selected: string[]) => void;
  /** Shown on the button when nothing is selected. */
  emptyLabel: string;
  hint?: string;
  /** Overrides the button text when set — for "Weekdays" rather than five day names. */
  summary?: string | null;
}

/**
 * A dropdown whose options are checkboxes.
 *
 * <p>Not a native `<select multiple>`: that renders as a scrolling list box that is always
 * open, requires ctrl-click to select more than one (undiscoverable, and impossible on a
 * touchscreen), and cannot be styled. This keeps the compactness of a dropdown while the
 * options stay ordinary checkboxes — which is also what makes them reachable by keyboard and
 * announced correctly.
 *
 * <p>The panel is a `fieldset` with a `legend`, so a screen reader announces the group name
 * before each option rather than reading seven unrelated checkboxes.
 */
export function CheckboxDropdown({
  legend,
  options,
  selected,
  onChange,
  emptyLabel,
  hint,
  summary,
}: CheckboxDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // Close on an outside click or Escape. Without this the panel stays open behind whatever
  // the user does next, which on a form this size means it covers the fields below it.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        // Focus must come back to the button, or a keyboard user is left with focus on a
        // panel that no longer exists and has to tab from the top of the document.
        buttonRef.current?.focus();
      }
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function toggle(value: string) {
    onChange(
      selected.includes(value)
        ? selected.filter((candidate) => candidate !== value)
        : // Kept in the order the options are declared rather than the order they were
          // clicked, so the summary reads "Mon, Tue" and never "Tue, Mon".
          options.filter((option) => option.value === value || selected.includes(option.value))
            .map((option) => option.value),
    );
  }

  const buttonText =
    summary ?? (selected.length === 0
      ? emptyLabel
      : options
          .filter((option) => selected.includes(option.value))
          .map((option) => option.shortLabel ?? option.label)
          .join(', '));

  return (
    <div ref={containerRef} className="relative">
      <span className="block text-sm font-medium text-felt-900" id={`${panelId}-label`}>
        {legend}
      </span>

      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-labelledby={`${panelId}-label ${panelId}-value`}
        onClick={() => setOpen((current) => !current)}
        className="mt-1.5 flex w-full items-center justify-between gap-2 rounded-lg bg-white px-3.5 py-2.5 text-left text-sm text-ink-900 ring-1 ring-inset ring-ink-300 transition-shadow hover:ring-ink-400 focus:ring-2 focus:ring-inset focus:ring-felt-600 focus:outline-none"
      >
        <span id={`${panelId}-value`} className={selected.length ? '' : 'text-ink-500'}>
          {buttonText}
        </span>
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`h-4 w-4 shrink-0 text-ink-500 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M5.5 7.5L10 12l4.5-4.5z" />
        </svg>
      </button>

      {open && (
        <fieldset
          id={panelId}
          className="absolute z-20 mt-1 w-full rounded-lg border border-ink-200 bg-white p-3 shadow-lifted"
        >
          <legend className="sr-only">{legend}</legend>
          <div className="flex flex-col gap-1.5">
            {options.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm text-ink-700 hover:bg-ink-50"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(option.value)}
                  onChange={() => toggle(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
          {hint && <p className="mt-2 border-t border-ink-100 pt-2 text-xs text-ink-500">{hint}</p>}
        </fieldset>
      )}
    </div>
  );
}

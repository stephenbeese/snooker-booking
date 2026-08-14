import { addDays, formatDateLong, todayIso } from '@/lib/datetime';

interface DateSelectorProps {
  date: string;
  /**
   * How far ahead the club sells, from `GET /api/club`.
   *
   * <p>No default. It previously defaulted to 30, which silently disagreed with the server
   * whenever an admin changed the booking window: at 60 the input's `max` still stopped at 30
   * and the forward arrow disabled halfway through the range the club was actually selling.
   * A default here is a second source of truth for a number the server already publishes.
   */
  maxAdvanceDays: number | undefined;
  onChange: (date: string) => void;
}

export function DateSelector({ date, maxAdvanceDays, onChange }: DateSelectorProps) {
  const today = todayIso();
  // Undefined only while the club query is in flight. Leaving `max` unset for that moment is
  // the honest option — capping at a guessed number would block dates that are genuinely
  // bookable, and the server rejects anything beyond the real window anyway.
  const max = maxAdvanceDays === undefined ? undefined : addDays(today, maxAdvanceDays);
  const atStart = date <= today;
  const atEnd = max !== undefined && date >= max;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={atStart}
        onClick={() => onChange(addDays(date, -1))}
        aria-label="Previous day"
        className="rounded-lg border border-ink-300 px-2.5 py-2 text-sm text-ink-700 transition-colors hover:bg-ink-50 disabled:opacity-40 disabled:hover:bg-transparent"
      >
        ←
      </button>

      <div>
        <label htmlFor="booking-date" className="sr-only">
          Booking date
        </label>
        {/* Native date input: no picker dependency, and it is the best control on
            mobile by a wide margin. */}
        <input
          id="booking-date"
          type="date"
          value={date}
          min={today}
          {...(max === undefined ? {} : { max })}
          onChange={(event) => onChange(event.target.value)}
          className="rounded-lg border border-ink-300 px-3 py-2 text-sm text-ink-900"
        />
      </div>

      <button
        type="button"
        disabled={atEnd}
        onClick={() => onChange(addDays(date, 1))}
        aria-label="Next day"
        className="rounded-lg border border-ink-300 px-2.5 py-2 text-sm text-ink-700 transition-colors hover:bg-ink-50 disabled:opacity-40 disabled:hover:bg-transparent"
      >
        →
      </button>

      <span className="ml-1 hidden text-sm font-medium text-felt-900 sm:inline">
        {formatDateLong(date)}
      </span>
    </div>
  );
}

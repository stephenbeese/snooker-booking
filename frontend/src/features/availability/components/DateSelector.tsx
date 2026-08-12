import { addDays, formatDateLong, todayIso } from '@/lib/datetime';

interface DateSelectorProps {
  date: string;
  maxAdvanceDays?: number;
  onChange: (date: string) => void;
}

export function DateSelector({ date, maxAdvanceDays = 30, onChange }: DateSelectorProps) {
  const today = todayIso();
  const max = addDays(today, maxAdvanceDays);
  const atStart = date <= today;
  const atEnd = date >= max;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={atStart}
        onClick={() => onChange(addDays(date, -1))}
        aria-label="Previous day"
        className="rounded border border-gray-300 px-2 py-1.5 text-sm disabled:opacity-40"
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
          max={max}
          onChange={(event) => onChange(event.target.value)}
          className="rounded border border-gray-300 px-2 py-1.5 text-sm"
        />
      </div>

      <button
        type="button"
        disabled={atEnd}
        onClick={() => onChange(addDays(date, 1))}
        aria-label="Next day"
        className="rounded border border-gray-300 px-2 py-1.5 text-sm disabled:opacity-40"
      >
        →
      </button>

      <span className="ml-1 text-sm text-gray-600">{formatDateLong(date)}</span>
    </div>
  );
}

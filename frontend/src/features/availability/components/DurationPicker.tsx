import type { DurationOption } from '../types';

interface DurationPickerProps {
  options: DurationOption[];
  value: number | null;
  onChange: (minutes: number | null) => void;
}

/**
 * Options come from the server. The client never derives them from min/max/increment, or
 * it would eventually offer a duration the API rejects.
 */
export function DurationPicker({ options, value, onChange }: DurationPickerProps) {
  return (
    <div>
      <label htmlFor="duration" className="mr-2 text-sm text-ink-600">
        Duration
      </label>
      <select
        id="duration"
        value={value ?? ''}
        onChange={(event) =>
          onChange(event.target.value === '' ? null : Number(event.target.value))
        }
        className="rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm text-ink-900"
      >
        <option value="">Any</option>
        {options.map((option) => (
          <option key={option.minutes} value={option.minutes}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

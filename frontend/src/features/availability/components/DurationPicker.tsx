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
      <label htmlFor="duration" className="mr-2 text-sm text-gray-700">
        Duration
      </label>
      <select
        id="duration"
        value={value ?? ''}
        onChange={(event) =>
          onChange(event.target.value === '' ? null : Number(event.target.value))
        }
        className="rounded border border-gray-300 px-2 py-1.5 text-sm"
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

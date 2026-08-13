import { Link } from 'react-router';
import type { SettingsWarning } from '../types';

/**
 * The bookings a settings change has stranded.
 *
 * <p>Deliberately prominent, and deliberately not an error. The save succeeded and the
 * bookings still stand — rules apply when a booking is made, never retroactively. But staff
 * must not close a Monday with eleven games on it and find out when the customers arrive, so
 * this states plainly that the bookings are unaffected and links to each one.
 */
export function SettingsWarnings({ warnings }: { warnings: SettingsWarning[] }) {
  if (warnings.length === 0) {
    return null;
  }

  return (
    <div
      role="alert"
      className="mt-4 rounded-card border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
    >
      <p className="font-semibold">
        Saved — but {warnings.length} existing{' '}
        {warnings.length === 1 ? 'booking falls' : 'bookings fall'} outside the new rules.
      </p>
      <p className="mt-1">
        These bookings are unchanged and still stand. Cancel them yourself if the change means
        they cannot go ahead.
      </p>
      <ul className="mt-3 space-y-1">
        {warnings.map((warning) => (
          <li key={warning.reference}>
            <Link
              to={`/admin/bookings/${warning.reference}`}
              className="font-medium underline underline-offset-2"
            >
              {warning.reference}
            </Link>{' '}
            — {warning.detail}
          </li>
        ))}
      </ul>
    </div>
  );
}

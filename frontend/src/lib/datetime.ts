/**
 * The backend sends club-local wall-clock strings ("14:00:00") for display and absolute
 * instants for anything posted back, so formatting here needs no timezone maths — which
 * is deliberate: the club's timezone is the backend's business.
 */

/** "14:00:00" -> "14:00" */
export function formatSlotTime(time: string): string {
  return time.slice(0, 5);
}

/** ISO date -> "Thu 20 Aug 2026" */
export function formatDateLong(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) {
    return isoDate;
  }
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/**
 * ISO weekday number (1 = Monday) -> "Monday".
 *
 * <p>Derived from a known-Monday date rather than a hardcoded array, so the names follow
 * the locale instead of being English-only strings the backend would have to translate.
 * 2024-01-01 was a Monday.
 */
export function weekdayName(isoDayOfWeek: number, style: 'long' | 'short' = 'long'): string {
  const date = new Date(Date.UTC(2024, 0, isoDayOfWeek));
  return new Intl.DateTimeFormat('en-GB', { weekday: style, timeZone: 'UTC' }).format(date);
}

/** Today in the browser's locale as an ISO date, for the date input's default. */
export function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Shifts an ISO date by whole days without tripping over month boundaries. */
export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) {
    return isoDate;
  }
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

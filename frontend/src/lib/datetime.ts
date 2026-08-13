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

/**
 * The wall-clock time `minutes` after a "HH:MM:SS" start, as "HH:MM".
 *
 * <p>Deliberately not `Slot.endTime`, which is the end of the *cell* (one increment) and not
 * the end of the booking: a 60-minute booking in a 30-minute grid ends an increment later
 * than the cell it starts in.
 *
 * <p>Plain modular arithmetic on the club's own wall clock, with no Date involved. The
 * backend has already resolved the club's timezone; reconstructing a Date here would
 * reintroduce the browser's zone and could shift the displayed time by an hour. Wraps past
 * midnight for a late booking rather than rendering "25:30".
 */
export function addMinutesToTime(time: string, minutes: number): string {
  const [hours = 0, mins = 0] = time.split(':').map(Number);
  const total = ((hours * 60 + mins + minutes) % 1440 + 1440) % 1440;
  const endHours = String(Math.floor(total / 60)).padStart(2, '0');
  const endMinutes = String(total % 60).padStart(2, '0');
  return `${endHours}:${endMinutes}`;
}

/**
 * Minutes as words: 30 -> "30 mins", 90 -> "1 hour 30 mins".
 *
 * <p>Mirrors `AvailabilityService.formatDuration` on the backend, which labels the duration
 * options. Kept identical so a duration never reads one way in the picker and another in the
 * summary beside it.
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} mins`;
  }
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  const hourPart = hours === 1 ? '1 hour' : `${hours} hours`;
  return remainder === 0 ? hourPart : `${hourPart} ${remainder} mins`;
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

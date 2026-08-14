import type { AdminBooking } from './types';
import type { DayAvailability } from '@/features/availability/types';

/**
 * The arithmetic behind the diary grid, kept out of the component so it can be tested
 * without rendering anything.
 *
 * <p>Everything here works in club-local wall-clock minutes from midnight. The backend has
 * already resolved the club's timezone into the "HH:MM:SS" strings it sends, so no `Date` is
 * constructed anywhere in this file — building one would reintroduce the browser's timezone
 * and slide the whole grid by an hour for a member of staff travelling, or on the two days a
 * year the offsets differ.
 */

/** Statuses that occupy a table. Anything else leaves the slot sellable. */
const OCCUPYING: ReadonlySet<AdminBooking['status']> = new Set([
  'PENDING_PAYMENT',
  'CONFIRMED',
  'COMPLETED',
  'NO_SHOW',
]);

/** "14:30:00" or "14:30" -> 870. */
export function toMinutes(time: string): number {
  const [hours = 0, mins = 0] = time.split(':').map(Number);
  return hours * 60 + mins;
}

/** 870 -> "14:30". Wraps past midnight rather than rendering "25:30". */
export function fromMinutes(total: number): string {
  const wrapped = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

/**
 * The diary's column axis: every increment the club is open, whether or not it is still
 * sellable.
 *
 * <p>Deliberately **not** `DayAvailability.slotTimes`. That axis drops slots that have already
 * elapsed when the date is today (Phase 2), which is right for a customer choosing a time and
 * wrong here: at 14:00 it would start the day at 14:00 while the day's bookings still include
 * the 10:00 one, leaving that booking with no column to occupy. Staff reconciling a day need
 * the morning they have already worked.
 *
 * <p>Closing time is the end of the last slot, not the start of one, so the axis stops an
 * increment short of it. A club closing at 23:00 in 30-minute increments last *starts* at
 * 22:30.
 */
export function axisFor(availability: DayAvailability): string[] {
  if (!availability.clubOpen || !availability.openingTime || !availability.closingTime) {
    return [];
  }

  const increment = availability.incrementMinutes;
  if (increment <= 0) {
    return [];
  }

  const open = toMinutes(availability.openingTime);
  // A club closing at or after midnight ("00:00") wraps to 0 and would otherwise produce an
  // empty axis. Treat it as the end of this day rather than the start of it.
  const rawClose = toMinutes(availability.closingTime);
  const close = rawClose <= open ? rawClose + 1440 : rawClose;

  const times: string[] = [];
  for (let minute = open; minute + increment <= close; minute += increment) {
    times.push(fromMinutes(minute));
  }
  return times;
}

/** A booking placed on the axis: where it starts and how many columns it covers. */
export interface DiaryBlock {
  booking: AdminBooking;
  /** Index into the axis. */
  startIndex: number;
  /** Columns covered, always at least 1. */
  span: number;
}

/**
 * Lays one table's bookings onto the axis.
 *
 * <p>Only occupying statuses are placed. `forDay` returns a day's bookings *regardless of
 * status* — it feeds the dashboard counts too — so cancelled and expired rows arrive here and
 * must not paint a table as busy: that slot is free and sellable, and showing it occupied
 * would have staff turn away a booking they could take.
 *
 * <p>A booking starting before opening, or running past closing, is clamped to the axis rather
 * than dropped. Staff bookings are not bound by the customer notice window and an override can
 * move opening hours after a booking was taken, so an out-of-window booking is a real thing
 * that exists and hiding it would be the diary lying about the day.
 */
export function blocksFor(
  bookings: AdminBooking[],
  axis: string[],
  incrementMinutes: number,
): DiaryBlock[] {
  if (axis.length === 0 || incrementMinutes <= 0) {
    return [];
  }

  const axisStart = toMinutes(axis[0]!);
  const axisEnd = axisStart + axis.length * incrementMinutes;

  return bookings
    .filter((booking) => OCCUPYING.has(booking.status))
    .flatMap((booking) => {
      const start = toMinutes(booking.startTime);
      // Duration rather than endTime: a booking ending at midnight sends "00:00:00", which
      // is numerically before its own start.
      const end = start + booking.durationMinutes;

      if (end <= axisStart || start >= axisEnd) {
        return [];
      }

      const startIndex = Math.max(0, Math.floor((start - axisStart) / incrementMinutes));
      const endIndex = Math.min(axis.length, Math.ceil((end - axisStart) / incrementMinutes));

      return [{ booking, startIndex, span: Math.max(1, endIndex - startIndex) }];
    })
    .sort((a, b) => a.startIndex - b.startIndex);
}

/**
 * The cells of one table row: a block where a booking sits, otherwise whether the slot is
 * sellable.
 *
 * <p>Free/busy comes from the availability payload, which is the same authority the booking
 * endpoint uses — so a cell the diary shows as free is one a telephone booking will actually
 * accept. Availability is indexed by time rather than by position, because its own axis omits
 * elapsed slots and would otherwise be off by however many the morning had.
 */
export type DiaryCell =
  | { kind: 'block'; block: DiaryBlock }
  | { kind: 'covered' }
  | { kind: 'free' }
  | { kind: 'unavailable'; reason: string | null };

export function rowFor(
  bookings: AdminBooking[],
  axis: string[],
  incrementMinutes: number,
  slotsByTime: Map<string, { available: boolean; reason: string | null }>,
): DiaryCell[] {
  const blocks = blocksFor(bookings, axis, incrementMinutes);
  const cells: DiaryCell[] = [];

  for (let index = 0; index < axis.length; ) {
    const block = blocks.find((candidate) => candidate.startIndex === index);
    if (block) {
      cells.push({ kind: 'block', block });
      // The block's own cell carries the colspan; the rest are placeholders so callers can
      // still index this array by column.
      for (let offset = 1; offset < block.span; offset += 1) {
        cells.push({ kind: 'covered' });
      }
      index += block.span;
      continue;
    }

    const slot = slotsByTime.get(axis[index]!);
    // No slot at this time means availability did not offer it — elapsed this morning, or
    // outside the sellable window. Not free, but not booked either.
    if (!slot) {
      cells.push({ kind: 'unavailable', reason: null });
    } else if (slot.available) {
      cells.push({ kind: 'free' });
    } else {
      cells.push({ kind: 'unavailable', reason: slot.reason });
    }
    index += 1;
  }

  return cells;
}

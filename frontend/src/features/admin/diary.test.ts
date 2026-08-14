import { describe, expect, it } from 'vitest';
import { makeAdminBooking } from '@/test/factories';
import { makeAvailability } from '@/test/factories';
import { axisFor, blocksFor, fromMinutes, rowFor, toMinutes } from './diary';

/** No slots offered — every cell falls through to "unavailable". */
const NO_SLOTS = new Map<string, { available: boolean; reason: string | null }>();

function freeAt(...times: string[]) {
  return new Map(times.map((time) => [time, { available: true, reason: null }]));
}

describe('axisFor', () => {
  it('covers the whole trading day, not just what is still sellable', () => {
    // The reason this exists rather than reusing `slotTimes`: that axis drops elapsed slots
    // when the date is today, so a diary built on it would lose the morning at lunchtime and
    // strand every booking taken before now.
    const axis = axisFor(
      makeAvailability({ openingTime: '10:00:00', closingTime: '13:00:00', incrementMinutes: 30 }),
    );

    expect(axis[0]).toBe('10:00');
    expect(axis).toHaveLength(6);
  });

  it('stops an increment short of closing, because closing ends the last slot', () => {
    // A club closing at 23:00 last *starts* at 22:30. An axis running to 23:00 would offer a
    // column for a slot that cannot be sold.
    const axis = axisFor(
      makeAvailability({ openingTime: '22:00:00', closingTime: '23:00:00', incrementMinutes: 30 }),
    );

    expect(axis).toEqual(['22:00', '22:30']);
  });

  it('handles a club trading past midnight', () => {
    // "00:00" is numerically before the opening time and would produce an empty axis — a
    // late-closing club would get no diary at all.
    const axis = axisFor(
      makeAvailability({ openingTime: '22:00:00', closingTime: '00:00:00', incrementMinutes: 60 }),
    );

    expect(axis).toEqual(['22:00', '23:00']);
  });

  it('gives a closed day no axis', () => {
    expect(axisFor(makeAvailability({ clubOpen: false }))).toEqual([]);
  });
});

describe('blocksFor', () => {
  const axis = axisFor(
    makeAvailability({ openingTime: '10:00:00', closingTime: '14:00:00', incrementMinutes: 30 }),
  );

  it('spans a booking across every increment it occupies', () => {
    const blocks = blocksFor(
      [makeAdminBooking({ startTime: '11:00:00', durationMinutes: 90 })],
      axis,
      30,
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.startIndex).toBe(2);
    expect(blocks[0]!.span).toBe(3);
  });

  it('leaves a cancelled booking off the grid entirely', () => {
    // The day endpoint returns bookings regardless of status because the dashboard counts
    // need them. Painting a cancelled one as occupied would show a table as busy when it is
    // free — staff would turn away a booking they could take.
    const blocks = blocksFor(
      [
        makeAdminBooking({ reference: 'SNK-GONE', status: 'CANCELLED', startTime: '10:00:00' }),
        makeAdminBooking({ reference: 'SNK-DEAD', status: 'EXPIRED', startTime: '10:30:00' }),
      ],
      axis,
      30,
    );

    expect(blocks).toEqual([]);
  });

  it('keeps a held booking on the grid', () => {
    // A hold is inventory reserved right now. Treating it as free would let staff double-book
    // a table while a customer is mid-checkout.
    const blocks = blocksFor(
      [makeAdminBooking({ status: 'PENDING_PAYMENT', startTime: '10:00:00' })],
      axis,
      30,
    );

    expect(blocks).toHaveLength(1);
  });

  it('clamps a booking that starts before the club opens', () => {
    // Staff are not bound by the customer notice window, and an opening-hours change can move
    // the window after a booking was taken. Dropping it would be the diary hiding a booking
    // that exists.
    const blocks = blocksFor(
      [makeAdminBooking({ startTime: '09:00:00', durationMinutes: 120 })],
      axis,
      30,
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.startIndex).toBe(0);
    expect(blocks[0]!.span).toBe(2);
  });

  it('clamps a booking running past closing time', () => {
    const blocks = blocksFor(
      [makeAdminBooking({ startTime: '13:00:00', durationMinutes: 180 })],
      axis,
      30,
    );

    expect(blocks[0]!.startIndex).toBe(6);
    expect(blocks[0]!.startIndex + blocks[0]!.span).toBe(axis.length);
  });

  it('measures a booking by duration, not by its end time', () => {
    // A booking ending at midnight sends "00:00:00", which is numerically before its own
    // start — measured that way it would have a negative span and vanish.
    const lateAxis = axisFor(
      makeAvailability({ openingTime: '22:00:00', closingTime: '00:00:00', incrementMinutes: 60 }),
    );
    const blocks = blocksFor(
      [makeAdminBooking({ startTime: '23:00:00', endTime: '00:00:00', durationMinutes: 60 })],
      lateAxis,
      60,
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.span).toBe(1);
  });

  it('ignores a booking for another part of the day', () => {
    const blocks = blocksFor(
      [makeAdminBooking({ startTime: '20:00:00', durationMinutes: 60 })],
      axis,
      30,
    );

    expect(blocks).toEqual([]);
  });
});

describe('rowFor', () => {
  const axis = axisFor(
    makeAvailability({ openingTime: '10:00:00', closingTime: '12:00:00', incrementMinutes: 30 }),
  );

  it('marks the columns a block covers so the row stays aligned', () => {
    const cells = rowFor(
      [makeAdminBooking({ startTime: '10:00:00', durationMinutes: 60 })],
      axis,
      30,
      NO_SLOTS,
    );

    // One cell per column, or the table's columns drift out of step with the header.
    expect(cells).toHaveLength(axis.length);
    expect(cells[0]!.kind).toBe('block');
    expect(cells[1]!.kind).toBe('covered');
  });

  it('reads free and busy from availability, matched by time not position', () => {
    // Availability's own axis omits elapsed slots. Indexing it positionally would offset every
    // cell by however many the morning had, showing one slot's state against another's column.
    const cells = rowFor([], axis, 30, freeAt('11:00'));

    expect(cells[0]!.kind).toBe('unavailable');
    expect(cells[2]!.kind).toBe('free');
  });

  it('does not show a cancelled booking as occupying its slot', () => {
    const cells = rowFor(
      [makeAdminBooking({ status: 'CANCELLED', startTime: '10:00:00', durationMinutes: 60 })],
      axis,
      30,
      freeAt('10:00', '10:30', '11:00', '11:30'),
    );

    expect(cells.every((cell) => cell.kind === 'free')).toBe(true);
  });
});

describe('time conversion', () => {
  it('round-trips a wall-clock time', () => {
    expect(fromMinutes(toMinutes('14:30:00'))).toBe('14:30');
  });
});

import { describe, expect, it } from 'vitest';
import { makeSlot, makeTable } from '@/test/factories';
import type { DurationOption } from './types';
import { clampedDuration, durationForRange, freeRunMinutes, snapDuration } from './rangeSelection';

const OPTIONS: DurationOption[] = [
  { minutes: 30, label: '30 mins' },
  { minutes: 60, label: '1 hour' },
  { minutes: 90, label: '1 hour 30 mins' },
  { minutes: 120, label: '2 hours' },
];

/** A row of free half-hours from 10:00. */
function freeRow(count: number) {
  return makeTable({
    slots: Array.from({ length: count }, (_, index) => {
      const minutes = 10 * 60 + index * 30;
      const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
      const mm = String(minutes % 60).padStart(2, '0');
      return makeSlot({ startTime: `${hh}:${mm}:00` });
    }),
  });
}

describe('snapDuration', () => {
  it('never returns a duration the club does not sell', () => {
    // The whole reason this exists. A drag across five cells asks for 150 minutes, which is
    // not in the list — posting it would be the client inventing a duration, which the
    // availability contract forbids.
    expect(snapDuration(OPTIONS, 150, 600)).toBe(120);
  });

  it('rounds down, never up', () => {
    // Rounding up would reserve — and charge for — time past where the customer released.
    expect(snapDuration(OPTIONS, 119, 600)).toBe(90);
  });

  it('respects the ceiling even when a longer option was asked for', () => {
    expect(snapDuration(OPTIONS, 120, 60)).toBe(60);
  });

  it('returns null when even the shortest duration does not fit', () => {
    // Ten minutes before closing: there is no honest answer, so the caller declines.
    expect(snapDuration(OPTIONS, 30, 10)).toBeNull();
  });
});

describe('freeRunMinutes', () => {
  it('measures to the end of the row when everything is free', () => {
    expect(freeRunMinutes(freeRow(4), 0, 30)).toBe(120);
  });

  it('stops at the first sold cell', () => {
    const table = makeTable({
      slots: [
        makeSlot({ startTime: '10:00:00' }),
        makeSlot({ startTime: '10:30:00' }),
        makeSlot({ startTime: '11:00:00', available: false, reason: 'BOOKED' }),
        makeSlot({ startTime: '11:30:00' }),
      ],
    });

    // Not 120: the 11:30 cell is free but unreachable past the booking at 11:00.
    expect(freeRunMinutes(table, 0, 30)).toBe(60);
  });

  it('ignores the anchor s own bookability, which is the thing being recalculated', () => {
    // A faded cell is the case the whole clamp feature exists for. If its own
    // `bookableForRequestedDuration: false` bounded the run, the clamp would always measure
    // zero and every faded cell would stay unusable.
    const table = makeTable({
      slots: [
        makeSlot({ startTime: '10:00:00', bookableForRequestedDuration: false }),
        makeSlot({ startTime: '10:30:00' }),
      ],
    });

    expect(freeRunMinutes(table, 0, 30)).toBe(60);
  });
});

describe('durationForRange', () => {
  it('counts the target cell in, so dragging one cell along asks for an hour', () => {
    // Dragging 10:00 to 10:30 covers two half-hours on screen. Reading it as 30 minutes
    // would stop the bar short of where the pointer was released.
    expect(durationForRange(freeRow(4), '2026-08-20T10:00:00Z', '2026-08-20T10:30:00Z', OPTIONS, 30)).toBe(60);
  });

  it('snaps a range the club does not sell down to one it does', () => {
    // Five cells = 150 minutes, which is not an option.
    expect(durationForRange(freeRow(6), '2026-08-20T10:00:00Z', '2026-08-20T12:00:00Z', OPTIONS, 30)).toBe(120);
  });

  it('will not drag through a booked cell', () => {
    const table = makeTable({
      slots: [
        makeSlot({ startTime: '10:00:00' }),
        makeSlot({ startTime: '10:30:00' }),
        makeSlot({ startTime: '11:00:00', available: false, reason: 'BOOKED' }),
        makeSlot({ startTime: '11:30:00' }),
      ],
    });

    // Dragged across four cells, but only two are reachable.
    expect(durationForRange(table, '2026-08-20T10:00:00Z', '2026-08-20T11:30:00Z', OPTIONS, 30)).toBe(60);
  });

  it('refuses a backwards range rather than swapping the ends', () => {
    // The caller re-anchors on this, so dragging left picks a new start time — which is what
    // the gesture looks like it is doing. Silently swapping would leave the start time
    // jumping to wherever the pointer happened to stop.
    expect(durationForRange(freeRow(4), '2026-08-20T11:00:00Z', '2026-08-20T10:00:00Z', OPTIONS, 30)).toBeNull();
  });

  it('returns null for a cell that is not in this row', () => {
    expect(durationForRange(freeRow(4), '2026-08-20T10:00:00Z', '2026-08-20T23:00:00Z', OPTIONS, 30)).toBeNull();
  });
});

describe('clampedDuration', () => {
  it('drops to what the server says fits', () => {
    const slot = makeSlot({
      startTime: '22:00:00',
      bookableForRequestedDuration: false,
      maxDurationMinutes: 60,
    });

    expect(clampedDuration(slot, OPTIONS)).toBe(60);
  });

  it('snaps down when what fits is not itself an option', () => {
    // 75 minutes of trading left, and the club sells 30/60/90/120.
    const slot = makeSlot({
      startTime: '22:00:00',
      bookableForRequestedDuration: false,
      maxDurationMinutes: 75,
    });

    expect(clampedDuration(slot, OPTIONS)).toBe(60);
  });

  it('gives up when nothing fits at all', () => {
    const slot = makeSlot({
      startTime: '22:50:00',
      bookableForRequestedDuration: false,
      maxDurationMinutes: 10,
    });

    expect(clampedDuration(slot, OPTIONS)).toBeNull();
  });
});

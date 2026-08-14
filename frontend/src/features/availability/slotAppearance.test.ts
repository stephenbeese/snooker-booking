import { describe, expect, it } from 'vitest';
import { makeSlot } from '@/test/factories';
import { slotAppearance } from './slotAppearance';

describe('slotAppearance', () => {
  it('makes an available slot interactive', () => {
    const appearance = slotAppearance(makeSlot({ startTime: '14:00:00' }), '14:00', null);

    expect(appearance.interactive).toBe(true);
    expect(appearance.label).toBe('14:00 — available');
  });

  it('marks the selected slot as such', () => {
    const appearance = slotAppearance(makeSlot({ startTime: '14:00:00' }), '14:00', 'only');

    expect(appearance.label).toBe('14:00 — selected');
    expect(appearance.className).toContain('bg-felt-700');
  });

  it('paints the middle of a booking as the booking, not as "does not fit"', () => {
    // `bookableForRequestedDuration` answers "could a booking of this length START here", so
    // for a 19:00–23:00 booking against a 23:00 close every cell from 19:30 on answers false —
    // and those are exactly the cells the booking occupies. Testing it ahead of the span drew
    // one dark cell at 19:00 followed by seven pale ones, each still printing its own time.
    const slot = makeSlot({
      startTime: '19:30:00',
      bookableForRequestedDuration: false,
      maxDurationMinutes: 210,
    });

    const appearance = slotAppearance(slot, '19:30', 'middle');

    expect(appearance.className).toContain('bg-felt-700');
    // Blank, so the run reads as one bar rather than a column of separate times.
    expect(appearance.text).toBe('');
  });

  it('still refuses a lone selected cell that no longer fits the duration', () => {
    // The other half of the ordering, and the reason it cannot simply be reversed. A single-
    // cell span IS the anchor, and the anchor's own bookability is the server's verdict on the
    // whole booking — so it must keep losing its selected look when the customer lengthens the
    // booking past what fits. That is how a stale selection used to reach the summary bar
    // priced for the old duration.
    const slot = makeSlot({
      startTime: '14:00:00',
      bookableForRequestedDuration: false,
      maxDurationMinutes: 90,
    });

    const appearance = slotAppearance(slot, '14:00', null);

    expect(appearance.interactive).toBe(false);
    expect(appearance.label).toBe('14:00 — Up to 1 hour 30 mins only');
  });

  it.each([
    ['BOOKED', 'Already booked'],
    ['MAINTENANCE', 'Unavailable — maintenance'],
    ['TABLE_INACTIVE', 'Table out of service'],
    ['PAST', 'Time has passed'],
    ['INSUFFICIENT_NOTICE', 'Too soon to book'],
  ] as const)('explains why a slot is unavailable: %s', (reason, expected) => {
    const slot = makeSlot({ startTime: '14:00:00', available: false, reason });

    const appearance = slotAppearance(slot, '14:00', null);

    expect(appearance.interactive).toBe(false);
    expect(appearance.label).toBe(`14:00 — ${expected}`);
  });

  it('distinguishes maintenance from booked visually, not just in text', () => {
    const booked = slotAppearance(
      makeSlot({ startTime: '14:00:00', available: false, reason: 'BOOKED' }),
      '14:00',
      null,
    );
    const maintenance = slotAppearance(
      makeSlot({ startTime: '14:00:00', available: false, reason: 'MAINTENANCE' }),
      '14:00',
      null,
    );

    expect(booked.className).not.toBe(maintenance.className);
  });

  it('says how long fits when the requested duration does not', () => {
    // Free cell, but only 60 minutes remain before the next booking, so a 90-minute
    // request cannot start here. reason is null because a shorter booking would work.
    const slot = makeSlot({
      startTime: '22:00:00',
      available: true,
      reason: null,
      bookableForRequestedDuration: false,
      maxDurationMinutes: 60,
    });

    const appearance = slotAppearance(slot, '22:00', null);

    expect(appearance.interactive).toBe(false);
    expect(appearance.label).toBe('22:00 — Up to 1 hour only');
  });

  it('uses the reason when no duration fits at all', () => {
    const slot = makeSlot({
      startTime: '22:30:00',
      available: true,
      reason: 'INSUFFICIENT_REMAINING_TIME',
      bookableForRequestedDuration: false,
      maxDurationMinutes: 0,
    });

    const appearance = slotAppearance(slot, '22:30', null);

    expect(appearance.label).toBe('22:30 — Not enough time before closing');
  });

  it('keeps an available slot clickable when no duration was requested', () => {
    const slot = makeSlot({ startTime: '14:00:00', bookableForRequestedDuration: null });

    expect(slotAppearance(slot, '14:00', null).interactive).toBe(true);
  });
});

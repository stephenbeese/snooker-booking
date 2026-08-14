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

  it('stops showing a selected slot as selected once it no longer fits the duration', () => {
    // Order-dependent: checking `isSelected` first left the cell green, clickable and
    // labelled "selected" after the customer lengthened the booking past what fits there,
    // which is how a stale selection reached the summary bar priced for the old duration.
    const slot = makeSlot({
      startTime: '14:00:00',
      bookableForRequestedDuration: false,
      maxDurationMinutes: 90,
    });

    const appearance = slotAppearance(slot, '14:00', 'only');

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

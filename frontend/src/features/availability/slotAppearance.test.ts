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

  it('leaves a slot fully clickable even when it cannot hold the current duration', () => {
    // These used to be faded and captioned "click to shorten to it". A click now sets only the
    // START — the length comes from the second click — so a cell that cannot hold the length
    // previously asked for is an ordinary place to begin, and dimming it said "you cannot click
    // this" about one of the most ordinary things to click.
    const slot = makeSlot({
      startTime: '19:30:00',
      bookableForRequestedDuration: false,
      reason: null,
      maxDurationMinutes: 210,
    });

    const appearance = slotAppearance(slot, '19:30', null);

    expect(appearance.interactive).toBe(true);
    expect(appearance.className).toContain('bg-felt-100');
    expect(appearance.className).not.toContain('bg-felt-50');
    // No leftover offer to shorten anything: the clamp it referred to no longer exists.
    expect(appearance.label).toBe('19:30 — available');
  });

  it('still refuses a slot where no booking of any length fits', () => {
    // The boundary. `reason` is set by the server exactly when nothing fits, so this cell
    // cannot start a booking however short, and must stay visibly dead.
    const slot = makeSlot({
      startTime: '22:50:00',
      bookableForRequestedDuration: false,
      reason: 'INSUFFICIENT_REMAINING_TIME',
      maxDurationMinutes: 0,
    });

    const appearance = slotAppearance(slot, '22:50', null);

    expect(appearance.interactive).toBe(false);
    expect(appearance.className).toContain('cursor-not-allowed');
    expect(appearance.label).toBe('22:50 — Not enough time before closing');
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

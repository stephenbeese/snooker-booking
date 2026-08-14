import { afterEach, describe, expect, it, vi } from 'vitest';
// Reaching into e2e/ from a unit test, deliberately: Playwright collects everything under
// e2e/ as a spec, so a Vitest file cannot live next to the helper it covers. The date
// allocation is ordinary logic and belongs in the fast suite, not behind a browser run.
import { bookingDate, weekdayOf } from '../../e2e/support/helpers';

/**
 * The one property the spec dates have to hold: no two specs that book share a day.
 *
 * <p>Worth a unit test rather than trusting the reading, because the bug it guards against is
 * invisible on most days. `openDay(2)` and `openDay(3)` return the *same* date
 * whenever offset 2 falls on a Sunday — so an earlier version of this allocation collided on
 * two start weekdays out of seven, and the e2e failures it caused appeared to come and go for
 * no reason. Fake timers let all seven be checked in milliseconds instead of waiting a week.
 */
describe('bookingDate', () => {
  const SPECS = ['happyPath', 'cardPayment', 'cardDeclined'] as const;

  afterEach(() => {
    vi.useRealTimers();
  });

  // Monday 2026-08-10 through the following Sunday: every weekday the suite can start on.
  for (let day = 0; day < 7; day++) {
    const today = new Date(2026, 7, 10 + day);

    it(`gives every booking spec its own open day when run on a ${today.toLocaleDateString('en-GB', { weekday: 'long' })}`, () => {
      vi.useFakeTimers();
      vi.setSystemTime(today);

      const dates = SPECS.map((spec) => bookingDate(spec));

      expect(new Set(dates).size, `dates collided: ${dates.join(', ')}`).toBe(SPECS.length);
      // Sunday's shorter opening hours are why these are allocated by open day, not by offset.
      for (const date of dates) {
        expect(weekdayOf(date)).not.toBe('Sunday');
      }
      // Inside the 30-day customer advance window, or the grid refuses to show the date at all.
      for (const date of dates) {
        const days = (new Date(date).getTime() - today.getTime()) / 86_400_000;
        expect(days).toBeGreaterThanOrEqual(2);
        expect(days).toBeLessThan(30);
      }
    });
  }
});

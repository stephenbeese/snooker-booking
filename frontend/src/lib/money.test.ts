import { describe, expect, it } from 'vitest';
import { formatPence, penceToPounds, poundsToPence } from './money';

describe('poundsToPence', () => {
  it('converts whole and fractional pounds', () => {
    expect(poundsToPence('12')).toBe(1200);
    expect(poundsToPence('12.50')).toBe(1250);
    expect(poundsToPence(9.99)).toBe(999);
  });

  it('rounds rather than truncates', () => {
    // The reason this function exists. 12.15 * 100 is 1214.9999999999998 in binary floating
    // point, so Math.trunc would store £12.14 — a penny lost on every booking at that rate,
    // invisible in testing and obvious in the accounts.
    expect(poundsToPence('12.15')).toBe(1215);
    expect(poundsToPence('8.29')).toBe(829);
    // Not a rounding guarantee for exact halves: 1.005 is stored as 1.00499999... so this is
    // 100, not 101. Recorded rather than hidden — sub-penny input is not money the club can
    // charge, and pretending otherwise would be the more surprising behaviour.
    expect(poundsToPence('1.005')).toBe(100);
  });

  it('tolerates what a person actually types', () => {
    expect(poundsToPence(' 15.00 ')).toBe(1500);
    expect(poundsToPence('£15')).toBe(1500);
  });

  it('returns null for anything unusable rather than NaN', () => {
    // A NaN reaching the API becomes a rate of "null" and a 400 the user cannot interpret.
    // Null makes the caller decide, and every caller here refuses to submit.
    expect(poundsToPence('')).toBeNull();
    expect(poundsToPence('abc')).toBeNull();
    expect(poundsToPence(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('penceToPounds', () => {
  it('gives a plain editable value, with no currency symbol', () => {
    // formatPence would return "£12.00", which a number input cannot parse back.
    expect(penceToPounds(1200)).toBe('12.00');
    expect(penceToPounds(999)).toBe('9.99');
    expect(penceToPounds(5)).toBe('0.05');
  });

  it('round-trips through poundsToPence unchanged', () => {
    // The property that matters: opening a rule for editing and saving it without touching
    // the field must not change the price.
    for (const pence of [1, 5, 99, 100, 1215, 1250, 9999, 100000]) {
      expect(poundsToPence(penceToPounds(pence))).toBe(pence);
    }
  });
});

describe('formatPence', () => {
  it('formats as sterling for display', () => {
    expect(formatPence(1200)).toBe('£12.00');
    expect(formatPence(0)).toBe('£0.00');
  });
});

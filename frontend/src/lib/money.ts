/** Formats integer pence as sterling. All money crosses the wire as pence. */
export function formatPence(pence: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(pence / 100);
}

/**
 * Pounds as typed by a person, to integer pence for the wire.
 *
 * <p>`Math.round`, not `Math.trunc`, and the reason is binary floating point: `12.15 * 100` is
 * `1214.9999999999998`, so truncating silently charges a penny less. That is the kind of error
 * nobody notices in testing and accountants notice at the end of the month.
 *
 * @returns null when the input is not a usable amount, so callers reject rather than send NaN
 */
export function poundsToPence(pounds: string | number): number | null {
  if (typeof pounds === 'string') {
    const trimmed = pounds.trim().replace(/^£/, '').trim();
    // Number('') is 0, not NaN — so without this an empty rate field sails through every
    // finite check and saves a rule at £0.00 instead of being rejected.
    if (trimmed === '') return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
  }
  return Number.isFinite(pounds) ? Math.round(pounds * 100) : null;
}

/**
 * Integer pence back to a plain pounds string for an editable field.
 *
 * <p>Deliberately not `formatPence`: that returns "£12.00", and putting a currency symbol into
 * a number input makes it unparseable on the way back out.
 */
export function penceToPounds(pence: number): string {
  return (pence / 100).toFixed(2);
}

import type { Page, APIRequestContext } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Dev-seed accounts. These exist only in the dev profile's seed and are checked by
 * SeedPasswordHashTest on the backend, so a drifting hash fails there rather than here as a
 * mysterious login timeout.
 */
export const ADMIN = { email: 'admin@snookerclub.test', password: 'Admin123!' };
export const CUSTOMER = { email: 'customer@snookerclub.test', password: 'Customer123!' };

/**
 * Signs in through the real form.
 *
 * <p>Deliberately not a seeded cookie or a test-only login endpoint. A backdoor that grants a
 * session is a backdoor whether or not it is profile-gated, and the login form is itself one
 * of the things worth testing.
 */
export async function login(page: Page, user: { email: string; password: string }) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Waiting for the URL to change, not for a spinner: the assertion should be about the
  // outcome the user sees, and a spinner that never resolves would otherwise pass.
  await expect(page).not.toHaveURL(/\/login/);
}

/**
 * An ISO date some days ahead, in the browser's timezone.
 *
 * <p>Always future-dated relative to the run rather than a fixed date, so these specs do not
 * quietly start failing the day a hardcoded date falls into the past — the classic e2e suite
 * that works until it doesn't.
 */
export function isoDaysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

/** The weekday name of an ISO date, as the settings screen labels it. */
export function weekdayOf(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year!, month! - 1, day!).toLocaleDateString('en-GB', { weekday: 'long' });
}

/** One day of the club's trading week. */
interface TradingDay {
  /** The club does not open at all. */
  closed: boolean;
  /** Open, but not for the full day — so a spec assuming a morning slot may find none. */
  short: boolean;
}

/** Where {@link globalSetup} leaves the trading week for the workers to pick up. */
export const OPENING_HOURS_ENV = 'E2E_CLUB_OPENING_HOURS';

/**
 * Reads the club's opening hours, indexed by `Date.getDay()` — 0 is Sunday.
 *
 * <p>This used to be hardcoded, and the hardcoding rotted. The rule was "skip Sunday", written
 * when the seed shut on Sundays and traded the other six days. The dev club now opens on Sunday
 * and shuts on Wednesday, so every read-only spec spent one day in seven pointed at a closed
 * club, rendering "The club is closed on this day" and then failing on a grid that was never
 * going to be there — a failure that reads as a broken booking page and is nothing of the kind.
 * Which specs failed depended on the day of the week the suite happened to run.
 *
 * <p>So whether a spec can run comes from what the club actually publishes, not from a weekday
 * name written down once. `GET /api/club` is public and already serves exactly this.
 *
 * <p>Called once from the Playwright global setup so that {@link openDay} can stay synchronous
 * — it has 17 call sites across five specs, and making it async to fetch a value that does not
 * change during a run would rewrite all of them for nothing.
 */
export async function fetchOpeningHours(baseUrl = 'http://localhost:8080'): Promise<TradingDay[]> {
  const response = await fetch(`${baseUrl}/api/club`);
  if (!response.ok) {
    throw new Error(`Could not read club hours: ${response.status}`);
  }
  const club = (await response.json()) as {
    openingHours: { dayOfWeek: number; closed: boolean; openTime: string | null }[];
  };

  const week: TradingDay[] = Array.from({ length: 7 }, () => ({ closed: true, short: true }));
  for (const day of club.openingHours) {
    // The API numbers days 1–7 from Monday (ISO-8601); JavaScript numbers them 0–6 from Sunday.
    week[day.dayOfWeek % 7] = {
      closed: day.closed,
      // A day that opens later than the usual 10:00 is "short". Specs that assume a morning
      // slot exists fail on one for reasons unconnected to what they test — which is why the
      // original helper skipped Sunday, and a reason that outlives the day it applied to.
      short: day.closed || (day.openTime ?? '23:59') > '10:00',
    };
  }
  return week;
}

/**
 * What the club does on the weekday a given date falls on.
 *
 * <p>Read from the environment on each call rather than cached in a module: global setup runs
 * in its own process, so nothing it assigns to a module variable reaches the workers.
 */
function tradingDayOf(isoDate: string, caller: string): TradingDay {
  const raw = process.env[OPENING_HOURS_ENV];
  if (!raw) {
    throw new Error(`${caller}() needs ${OPENING_HOURS_ENV}; check globalSetup is configured.`);
  }
  const [year, month, day] = isoDate.split('-').map(Number);
  return (JSON.parse(raw) as TradingDay[])[new Date(year!, month! - 1, day!).getDay()]!;
}

/**
 * A day the club is open with a full schedule, for specs that only read the grid.
 *
 * <p>Prefers a full-length trading day and falls back to any open one, so a club with nothing
 * but short days still yields a usable date rather than throwing.
 *
 * <p>Use this only where nothing is booked. A spec that creates a booking must take its own
 * day from {@link bookingDate} instead, or it contends with every other spec for the same
 * first free cell.
 */
export function openDay(startDays = 2): string {
  let fallback: string | null = null;
  for (let offset = startDays; offset < startDays + 7; offset++) {
    const iso = isoDaysFromNow(offset);
    const hours = tradingDayOf(iso, 'openDay');
    if (hours.closed) {
      continue;
    }
    if (!hours.short) {
      return iso;
    }
    fallback ??= iso;
  }
  if (fallback) {
    return fallback;
  }
  throw new Error('The club is closed every day in the next week, so no spec can read a grid.');
}

/**
 * One booking date per spec that books, so no two specs can contend for the same cell.
 *
 * <p>Every spec used to call the shared `openDay()` and click the *first* available cell of the
 * same shared day. A booking spec leaves a 15-minute PENDING_PAYMENT hold behind, so the next
 * spec to reach for that cell was refused with "that time has just been taken" — a failure
 * that reads as a bug in the booking flow and is not one. Which specs failed shifted from run
 * to run depending on ordering and on what the hold sweeper had got to yet.
 *
 * <p>Ordered, not a table of offsets. Distinct offsets do NOT give distinct dates: whenever an
 * offset lands on a Sunday, `openDay` skips forward onto its neighbour's day, so offsets
 * 2 and 3 resolve to the same date on two weekdays in seven. That is a collision that appears
 * only on certain days of the week — the worst kind to debug, and the reason the original
 * failures shifted between runs. Allocating consecutive open days by position instead means
 * the dates are distinct by construction on every start weekday.
 *
 * <p>Read-only specs are deliberately absent: they book nothing, so they can share any date
 * and are better off on the nearest open day, where the seed guarantees grid data.
 */
const BOOKING_DATE_SPECS = [
  /** booking-happy-path.spec.ts — reaches the Stripe redirect, leaving a hold. */
  'happyPath',
  /** stripe-checkout.spec.ts, successful payment — leaves a CONFIRMED booking behind. */
  'cardPayment',
  /** stripe-checkout.spec.ts, declined card — deliberately keeps its hold. */
  'cardDeclined',
  /** counter-payment.spec.ts — takes telephone bookings, which are CONFIRMED immediately. */
  'counterPayment',
] as const;

/**
 * This spec's own booking day: the nth day the club is actually open.
 *
 * <p>Reads the published hours for the same reason {@link openDay} does. This skipped Sundays
 * on the assumption the club was shut then; it now trades on Sunday and shuts on Wednesday, so
 * the skip both wasted an open day and handed specs a closed one. Unlike `openDay` a short
 * trading day is fine here — these specs book the first free cell, whenever it falls.
 */
export function bookingDate(spec: (typeof BOOKING_DATE_SPECS)[number]): string {
  const wanted = BOOKING_DATE_SPECS.indexOf(spec);
  let found = -1;
  // Two weeks is ample headroom for the dates above plus the closed days between them, and
  // stays well inside the 30-day advance window a customer booking is allowed.
  for (let offset = 2; offset < 2 + 14; offset++) {
    const iso = isoDaysFromNow(offset);
    if (tradingDayOf(iso, 'bookingDate').closed) {
      continue;
    }
    if (++found === wanted) return iso;
  }
  throw new Error(`No open day found for spec date "${spec}"`);
}

/**
 * Cancels the bookings a spec created, by the references it captured.
 *
 * <p>These specs run against a real developer database, so this takes explicit references
 * rather than a date: "release every booking on this day" would delete a developer's own
 * test data the moment a spec date happened to land on it. A fixture may remove what it
 * created; it may not remove what it merely fails to recognise — the same contract
 * `admin-pricing.spec.ts` keeps for pricing rules.
 *
 * <p>Cancel, not delete: cancelling is the club's own release path, it puts the slot back on
 * sale through the code the product uses, and there is no delete endpoint to abuse instead.
 *
 * <p>Best-effort per reference. A booking that has already lapsed to EXPIRED, or that a
 * previous teardown already cancelled, answers 4xx — and that is the desired state anyway, so
 * failing the run over it would turn a clean database into a red suite.
 */
export async function releaseBookings(request: APIRequestContext, references: string[]) {
  if (references.length === 0) return;
  await apiLogin(request, ADMIN);
  for (const reference of references) {
    await apiWrite(request, 'post', `/api/admin/bookings/${reference}/cancel`, {
      reason: 'e2e teardown',
    });
  }
}

/**
 * An authenticated API context, for setup and teardown that is not the thing under test.
 *
 * <p>Driving the UI to restore a setting after a test would double the runtime and, worse,
 * would leave the club misconfigured whenever an assertion failed mid-spec.
 */
export async function apiLogin(
  request: APIRequestContext,
  user: { email: string; password: string },
) {
  // Priming GET: the CSRF cookie must exist before any write, exactly as in the browser.
  await request.get('http://localhost:8080/api/auth/me');
  const state = await request.storageState();
  const csrf = state.cookies.find((cookie) => cookie.name === 'XSRF-TOKEN')?.value ?? '';
  const response = await request.post('http://localhost:8080/api/auth/login', {
    headers: { 'X-XSRF-TOKEN': csrf },
    data: { email: user.email, password: user.password },
  });
  if (!response.ok()) {
    throw new Error(`API login failed for ${user.email}: ${response.status()}`);
  }
  return csrf;
}

/** A write through the API, carrying the CSRF token the backend requires. */
export async function apiWrite(
  request: APIRequestContext,
  method: 'post' | 'put' | 'delete',
  path: string,
  data?: unknown,
) {
  const state = await request.storageState();
  const csrf = state.cookies.find((cookie) => cookie.name === 'XSRF-TOKEN')?.value ?? '';
  return request[method](`http://localhost:8080${path}`, {
    headers: { 'X-XSRF-TOKEN': csrf },
    ...(data === undefined ? {} : { data }),
  });
}

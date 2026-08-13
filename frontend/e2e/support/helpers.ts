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

/**
 * A day the club is open with a full schedule.
 *
 * <p>Sunday is seeded 12:00–20:00 rather than 10:00–23:00, so a spec that assumes a
 * particular slot exists can fail on a Sunday for reasons unconnected to what it tests.
 */
export function nextNonSunday(startDays = 2): string {
  for (let offset = startDays; offset < startDays + 7; offset++) {
    const iso = isoDaysFromNow(offset);
    if (weekdayOf(iso) !== 'Sunday') return iso;
  }
  throw new Error('No non-Sunday found in a 7-day window, which is impossible');
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

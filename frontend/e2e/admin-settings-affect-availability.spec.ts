import { expect, test } from '@playwright/test';
import { ADMIN, apiLogin, apiWrite, isoDaysFromNow, login, weekdayOf } from './support/helpers';

/**
 * The Phase 6 hard gate: a settings change made by staff is visible to a customer.
 *
 * <p>The point is the *pair* of browsers. A test that saves a setting and reads it back
 * proves only that a row was written; the failure that matters is a settings screen that
 * saves happily while the booking grid goes on using the old values. So each test drives the
 * admin UI, then loads the public page and asserts what a customer would actually see.
 *
 * <p>Settings are club-wide, so every test restores them in an `afterEach` that runs through
 * the API rather than the UI — a failed assertion must not leave the club closed.
 */

/** The seeded default week: 10:00–23:00, except Sunday 12:00–20:00. */
const DEFAULT_WEEK = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
].map((day, index) => ({
  day,
  closed: false,
  openTime: index === 6 ? '12:00:00' : '10:00:00',
  closeTime: index === 6 ? '20:00:00' : '23:00:00',
}));

const DEFAULT_RULES = {
  minDurationMinutes: 30,
  maxDurationMinutes: 240,
  incrementMinutes: 30,
  minNoticeMinutes: 60,
  maxAdvanceDays: 30,
  cancellationNoticeHours: 24,
  paymentHoldMinutes: 15,
};

test.describe('Admin settings change what customers can book', () => {
  test.afterEach(async ({ request }) => {
    // Through the API deliberately: restoring via the UI would fail to run whenever the test
    // failed partway, leaving the next test — and the developer's dev database — misconfigured.
    await apiLogin(request, ADMIN);
    const hours = await apiWrite(request, 'put', '/api/admin/settings/opening-hours', {
      days: DEFAULT_WEEK,
    });
    const rules = await apiWrite(request, 'put', '/api/admin/settings/booking-rules', DEFAULT_RULES);

    // Asserted, not fire-and-forget. A restore that silently fails leaves the club closed on
    // a weekday and every later test failing for a reason that has nothing to do with it —
    // which is exactly what happened once during development.
    expect(hours.status(), 'opening hours must be restored').toBe(200);
    expect(rules.status(), 'booking rules must be restored').toBe(200);
  });

  test('closing a day removes it from the customer booking grid', async ({ page, context }) => {
    // Far enough ahead that the seed has not booked anything on it.
    const targetDate = isoDaysFromNow(21);
    const weekday = weekdayOf(targetDate);

    await login(page, ADMIN);
    await page.goto('/admin/settings');

    const closedBox = page.getByRole('checkbox', { name: `${weekday} closed` });
    await expect(closedBox).toBeVisible();
    await closedBox.check();

    // The opening-hours section owns the first Save; scope to it rather than trusting order.
    const hoursSection = page.locator('section').filter({ hasText: 'Opening hours' }).first();
    await hoursSection.getByRole('button', { name: 'Save' }).click();
    await expect(hoursSection.getByRole('button', { name: 'Save' })).toBeEnabled();

    // A separate browser context: a customer, not the admin whose cache might be warm.
    const customerPage = await context.browser()!.newPage();
    await customerPage.goto('/book');
    await customerPage.getByLabel('Booking date').fill(targetDate);

    await expect(customerPage.getByText('The club is closed on this day.')).toBeVisible();
    // The stronger assertion: not one bookable cell anywhere on the page.
    await expect(customerPage.getByRole('button', { name: /— available$/ })).toHaveCount(0);

    await customerPage.close();
  });

  test('narrowing the opening hours shortens the grid', async ({ page, context }) => {
    const targetDate = isoDaysFromNow(21);
    const weekday = weekdayOf(targetDate);

    const before = await context.browser()!.newPage();
    await before.goto('/book');
    await before.getByLabel('Booking date').fill(targetDate);
    await expect(before.getByRole('button').filter({ hasText: /^\d{2}:\d{2}$/ }).first()).toBeVisible();
    const slotsBefore = await before.getByRole('button').filter({ hasText: /^\d{2}:\d{2}$/ }).count();
    await before.close();

    await login(page, ADMIN);
    await page.goto('/admin/settings');
    await page.getByLabel(`${weekday} opening time`).fill('14:00');
    await page.getByLabel(`${weekday} closing time`).fill('18:00');

    const hoursSection = page.locator('section').filter({ hasText: 'Opening hours' }).first();
    await hoursSection.getByRole('button', { name: 'Save' }).click();
    await expect(hoursSection.getByRole('button', { name: 'Save' })).toBeEnabled();

    const after = await context.browser()!.newPage();
    await after.goto('/book');
    await after.getByLabel('Booking date').fill(targetDate);
    await expect(after.getByRole('button').filter({ hasText: /^\d{2}:\d{2}$/ }).first()).toBeVisible();

    await expect
      .poll(async () => after.getByRole('button').filter({ hasText: /^\d{2}:\d{2}$/ }).count())
      .toBeLessThan(slotsBefore);
    // 14:00–18:00 on a 30-minute increment: the grid must start at 14:00 and stop before 18:00.
    await expect(after.getByRole('button', { name: /^14:00 — / }).first()).toBeVisible();
    await expect(after.getByRole('button', { name: /^18:00 — / })).toHaveCount(0);

    await after.close();
  });

  test('changing the slot increment respaces the grid and the duration options', async ({
    page,
    context,
  }) => {
    await login(page, ADMIN);
    await page.goto('/admin/settings');

    // 60-minute increment: durations must become multiples of 60, and the grid must lose
    // every half-hour column. The backend rejects durations that are not multiples of the
    // increment, so both fields have to move together.
    await page.getByLabel('Slot increment (minutes)').fill('60');
    await page.getByLabel('Shortest booking (minutes)').fill('60');
    await page.getByLabel('Longest booking (minutes)').fill('120');

    const rulesSection = page.locator('section').filter({ hasText: 'Booking rules' }).first();
    await rulesSection.getByRole('button', { name: 'Save' }).click();
    // An inconsistent combination is a 422 naming the field; assert no error appeared.
    await expect(rulesSection.getByRole('alert')).toHaveCount(0);

    const customerPage = await context.browser()!.newPage();
    await customerPage.goto('/book');
    await customerPage.getByLabel('Booking date').fill(isoDaysFromNow(21));
    await expect(
      customerPage.getByRole('button').filter({ hasText: /^\d{2}:\d{2}$/ }).first(),
    ).toBeVisible();

    // No half-past column anywhere.
    await expect(customerPage.getByRole('button', { name: /^\d{2}:30 — / })).toHaveCount(0);

    // And the duration picker offers only what the server now permits.
    const durations = await customerPage.getByLabel('Duration').locator('option').allInnerTexts();
    expect(durations.join(',')).not.toContain('30 mins');

    await customerPage.close();
  });

  test('a change that strands an existing booking warns staff without cancelling it', async ({
    page,
    request,
  }) => {
    // The rule that matters most: settings apply to new bookings only. A confirmed booking
    // is a promise already sold, so closing its day must warn rather than cancel — but staff
    // must be told, or they find out when the customer arrives.
    await apiLogin(request, ADMIN);

    // A booking of our own on a day nothing else uses, so the warning has something specific
    // to name and the assertion does not depend on what the seed happens to contain.
    const targetDate = isoDaysFromNow(23);
    const weekday = weekdayOf(targetDate);

    const tables = await (await request.get('http://localhost:8080/api/tables')).json();
    const created = await apiWrite(request, 'post', '/api/admin/bookings/telephone', {
      tableId: tables[0].id,
      date: targetDate,
      startTime: '14:00:00',
      durationMinutes: 60,
      customerEmail: 'warning-test@example.test',
      firstName: 'Warning',
      lastName: 'Test',
      customerPhone: '07700 900999',
    });
    expect(created.status(), 'the fixture booking must be created').toBe(201);
    const reference = (await created.json()).reference as string;

    await login(page, ADMIN);
    await page.goto('/admin/settings');
    await page.getByRole('checkbox', { name: `${weekday} closed` }).check();

    const hoursSection = page.locator('section').filter({ hasText: 'Opening hours' }).first();
    await hoursSection.getByRole('button', { name: 'Save' }).click();

    // The warning names the affected booking and says plainly that it still stands.
    const warning = hoursSection.getByRole('alert');
    await expect(warning).toBeVisible();
    await expect(warning).toContainText(reference);
    await expect(warning).toContainText(/unchanged and still stand/i);

    // And the booking really is untouched. A warning that accompanied a silent cancellation
    // would be worse than no warning at all, and only this assertion can tell them apart.
    await page.goto(`/admin/bookings/${reference}`);
    await expect(page.getByText('Confirmed', { exact: false }).first()).toBeVisible();

    // Tidy up: this booking would otherwise sit in the dev database forever.
    await apiWrite(request, 'post', `/api/admin/bookings/${reference}/cancel`, {
      reason: 'e2e cleanup',
    });
  });
});

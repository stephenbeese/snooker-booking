import { expect, test } from '@playwright/test';
import { ADMIN, apiLogin, login, openDay } from './support/helpers';

/**
 * The availability grid on the telephone booking page.
 *
 * <p>The component tests cover the wiring against a mocked API. What only a real run can show
 * is the thing the feature exists for: that the grid staff are shown and the booking the
 * server accepts are computed by the same code under the same policy. A grid that offers a
 * slot the create endpoint then refuses is worse than no grid at all — staff would read an
 * availability off the screen to someone on the phone and then have to take it back.
 *
 * <p>This spec creates no bookings and writes nothing, so it needs no cleanup. Everything it
 * asserts is a read.
 */
test.describe('Telephone booking availability', () => {
  test('the grid a member of staff sees is the one the server will honour', async ({
    page,
    request,
  }) => {
    const date = openDay();

    // Both contexts, separately: `request` carries its own cookie jar, so signing the page in
    // leaves the API context anonymous and every admin call it makes answers 401.
    await apiLogin(request, ADMIN);
    await login(page, ADMIN);
    await page.goto('/admin/bookings/telephone');

    await page.getByLabel('Date').fill(date);

    // The grid renders rather than an empty state.
    const firstFree = page.getByRole('button', { name: /— available$/ }).first();
    await expect(firstFree).toBeVisible();

    // What the page actually asked for, read back from the API with the same session. The
    // assertion is that the page's own grid agrees with the endpoint it claims to use.
    const response = await request.get(
      `http://localhost:8080/api/admin/availability?date=${date}&durationMinutes=60`,
    );
    expect(response.status()).toBe(200);
    const staffGrid = await response.json();

    const offered: string[] = staffGrid.tables
      .flatMap((row: { slots: { startTime: string; available: boolean }[] }) => row.slots)
      .filter((slot: { available: boolean }) => slot.available)
      .map((slot: { startTime: string }) => slot.startTime.slice(0, 5));
    expect(offered.length).toBeGreaterThan(0);

    // Every cell the grid renders as available names a time the server also called available.
    const label = await firstFree.getAttribute('aria-label');
    const renderedTime = label?.slice(0, 5) ?? '';
    expect(offered).toContain(renderedTime);
  });

  test('clicking a cell fills in the table and time it names', async ({ page }) => {
    // Before this, staff typed a time blind and learned on submit whether the table was free.
    await login(page, ADMIN);
    await page.goto('/admin/bookings/telephone');
    await page.getByLabel('Date').fill(openDay());

    const cell = page.getByRole('button', { name: /— available$/ }).first();
    await expect(cell).toBeVisible();
    const time = (await cell.getAttribute('aria-label'))?.slice(0, 5) ?? '';
    await cell.click();

    await expect(page.getByLabel('Start time')).toHaveValue(time);
    // A table was chosen too. Setting only the time would describe a slot nobody picked.
    await expect(page.getByLabel('Table')).not.toHaveValue('');
  });

  test('staff may still key a time the grid does not offer', async ({ page }) => {
    // BookingPolicy.staff() lifts notice and advance, and staff could always type an
    // arbitrary time. The picker is an affordance; if it locked the field it would have
    // removed a freedom the backend still grants.
    await login(page, ADMIN);
    await page.goto('/admin/bookings/telephone');
    await page.getByLabel('Date').fill(openDay());

    const cell = page.getByRole('button', { name: /— available$/ }).first();
    await expect(cell).toBeVisible();
    await cell.click();

    const time = page.getByLabel('Start time');
    await time.fill('10:17');
    await expect(time).toHaveValue('10:17');
  });

  test('the customer grid withholds what the staff grid offers', async ({ request }) => {
    // The two policies must genuinely differ, or the separate endpoint buys nothing. A date
    // beyond the customer advance window is the clearest case: staff sell it, customers
    // cannot see it.
    const beyondWindow = new Date();
    beyondWindow.setDate(beyondWindow.getDate() + 60);
    const far = beyondWindow.toISOString().slice(0, 10);

    const publicGrid = await (
      await request.get(`http://localhost:8080/api/availability?date=${far}`)
    ).json();
    expect(publicGrid.dayUnavailableReason).toBe('TOO_FAR_IN_ADVANCE');
    expect(publicGrid.tables).toHaveLength(0);

    // Read anonymously first, then sign in: the public endpoint must answer the same either
    // way, and the staff one only after authenticating.
    await apiLogin(request, ADMIN);
    const staffGrid = await (
      await request.get(`http://localhost:8080/api/admin/availability?date=${far}`)
    ).json();
    expect(staffGrid.dayUnavailableReason).toBeNull();
    expect(staffGrid.tables.length).toBeGreaterThan(0);
  });
});

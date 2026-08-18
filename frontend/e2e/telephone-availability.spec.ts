import { expect, test, type Page } from '@playwright/test';
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
/**
 * The durations the club currently sells, read off the page's own select.
 *
 * <p>Not a literal list. The club's min, max and increment are editable settings, and the
 * increment (30 minutes, one grid cell) is deliberately not the shortest sellable duration
 * (an hour) — so a spec that hardcodes "two cells is 60 minutes" encodes an assumption that is
 * both wrong today and free to change tomorrow. Reading the offered options keeps the
 * arithmetic honest without pinning the settings.
 */
/**
 * Three consecutive free cells in ONE table's row.
 *
 * <p>Scoped to a row on purpose. `getByRole('button', …).nth(n)` indexes across the whole grid,
 * so cells 0 and 2 are routinely on different tables and hours apart — a "drag" between them
 * is not a drag at all, and the duration it produced (150 minutes for what should have been 90)
 * was measuring the gap between unrelated cells.
 *
 * <p>Picks the first row that has three in a row, rather than assuming the first row does: the
 * dev club's earliest table may be partly booked by other specs that ran first.
 */
async function threeInARow(page: Page, increment = 30) {
  const minutesOf = (label: string): number => {
    const [hours, mins] = label.slice(0, 5).split(':').map(Number);
    return (hours ?? 0) * 60 + (mins ?? 0);
  };

  const rows = page.getByRole('row');
  for (let index = 0; index < (await rows.count()); index++) {
    const row = rows.nth(index);
    const labels = (
      await row
        .getByRole('button', { name: /— available$/ })
        .evaluateAll((cells) => cells.map((cell) => cell.getAttribute('aria-label') ?? ''))
    ).filter(Boolean);

    // Free is not the same as adjacent: a booking mid-row leaves gaps, and dragging across one
    // asks for a range the grid rightly refuses. Only a genuinely contiguous triple will do.
    for (let first = 0; first + 2 < labels.length; first++) {
      const [a, b, c] = [labels[first]!, labels[first + 1]!, labels[first + 2]!];
      if (minutesOf(b) - minutesOf(a) === increment && minutesOf(c) - minutesOf(b) === increment) {
        // Located by their own times, NOT by position among "available" cells.
        //
        // Position is not stable across a click. Selecting 10:00 for the club's minimum hour
        // covers 10:00 AND 10:30, and both cells relabel themselves "selected" — so the
        // available-cell list shrinks under the locator and `nth(2)`, resolved lazily at the
        // second click, silently addressed 12:30 instead of 11:00. The gesture then asked for
        // 150 minutes and the assertion blamed the app for the test's own stale index.
        const at = (label: string) =>
          row.getByRole('button', { name: new RegExp(`^${label.slice(0, 5)} — `) });
        return { start: at(a), middle: at(b), end: at(c), times: [a, b, c].map(minutesOf) };
      }
    }
  }
  throw new Error('No table has three consecutive free slots, so no range can be selected.');
}

async function durationOptions(page: Page): Promise<number[]> {
  const select = page.getByLabel('Duration');
  await expect(select.locator('option').first()).toBeAttached();
  const values = await select.locator('option').evaluateAll((options) =>
    options.map((option) => Number((option as HTMLOptionElement).value)),
  );
  expect(values.length).toBeGreaterThan(1);
  return values;
}

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

  test('dragging across the row sets the booking’s length', async ({ page }) => {
    // The one thing jsdom cannot show. The drag depends on a button releasing its implicit
    // pointer capture — without that release every pointer event after the press is retargeted
    // to the cell it started on, `pointerenter` never fires on the cells crossed, and the
    // gesture silently does nothing. jsdom implements neither capture method, so the component
    // test passes either way and only a real browser can tell the two apart.
    await login(page, ADMIN);
    await page.goto('/admin/bookings/telephone');
    await page.getByLabel('Date').fill(openDay());

    const duration = page.getByLabel('Duration');
    await expect(page.getByRole('button', { name: /— available$/ }).first()).toBeVisible();

    // The club's own numbers, not assumed ones: the grid's cells are 30 minutes apart but the
    // shortest duration it sells is an hour, so cell counts and durations are not the same
    // scale. Reading both off the page is what stops this spec encoding today's settings.
    const options = await durationOptions(page);
    const increment = 30;

    const { start, middle, end, times } = await threeInARow(page, increment);

    // Hover the intermediate cell rather than jumping start → end: a real drag emits
    // pointerenter on every cell it crosses, and that is the signal the grid extends on.
    await start.hover();
    await page.mouse.down();
    await middle.hover();
    await end.hover();
    await page.mouse.up();

    // Three cells inclusive, measured from the cells' own times, snapped DOWN to the longest
    // option that does not exceed it — never up, which would reserve and charge for time past
    // where the pointer was released.
    const dragged = times[2]! - times[0]! + increment;
    const expected = Math.max(...options.filter((minutes) => minutes <= dragged));
    await expect(duration).toHaveValue(String(expected));
  });

  test('a second click on the row sets the end without a drag', async ({ page }) => {
    // The keyboard-and-tap path to the same outcome. A drag is not available to everyone, and
    // on a touchscreen it competes with scrolling the grid sideways.
    await login(page, ADMIN);
    await page.goto('/admin/bookings/telephone');
    await page.getByLabel('Date').fill(openDay());

    await expect(page.getByRole('button', { name: /— available$/ }).first()).toBeVisible();

    const options = await durationOptions(page);
    const shortest = Math.min(...options);
    const { start, end, times } = await threeInARow(page);

    await start.click();
    // The first click alone books the club's shortest length, so the second is what proves the
    // range resolved rather than the page simply re-anchoring.
    await expect(page.getByLabel('Duration')).toHaveValue(String(shortest));

    await end.click();
    const expected = Math.max(...options.filter((minutes) => minutes <= times[2]! - times[0]! + 30));
    await expect(page.getByLabel('Duration')).toHaveValue(String(expected));
    // The gesture has to have changed something, or the assertion above would also pass on a
    // page that ignored the second click entirely.
    expect(expected).not.toBe(shortest);
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

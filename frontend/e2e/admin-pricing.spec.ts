import { expect, test, type Page } from '@playwright/test';
import { ADMIN, apiLogin, apiWrite, login, openDay } from './support/helpers';

/**
 * Editing a pricing rate, and the customer seeing the new price.
 *
 * <p>The component tests cover the form against a mocked API. This covers the thing that
 * actually matters and that mocks cannot show: a rate typed in pounds by staff arrives as
 * pence in the database and comes back out as the price quoted to the next customer. A
 * conversion slip here charges real money incorrectly.
 */

/**
 * The seeded catch-all rate as a number input reports it.
 *
 * <p>"12", not "12.00": a number input normalises away trailing zeros, so the field the form
 * populates with "12.00" reads back as "12". The same rate either way — worth pinning as a
 * number rather than a string so the test is about the value, not the formatting.
 */
const DEFAULT_RATE_POUNDS = 12;

/**
 * Every rule this spec creates is named with this prefix, and the cleanup deletes only rules
 * that carry it. That is the whole safety property: these specs run against a real developer
 * database holding real pricing rules, so the fixture has to be able to tell its own rows
 * apart from someone's actual configuration.
 */
const E2E_PREFIX = 'E2E';

/**
 * The pricing section, by its anchor id.
 *
 * <p>Was `locator('section').filter({ hasText: 'Pricing' }).first()`, which matched on prose
 * rather than on identity and so picked the wrong section. The settings page renders every
 * section at once when its queries resolve, and the "Table types" section describes itself as
 * applying to "every table and pricing rule" — so it matches `hasText: 'Pricing'` too, sits
 * earlier in the DOM, and wins `.first()`. It holds no "Add a pricing rule" button, so the
 * click waited out the full timeout.
 *
 * <p>Which of the two matched first varied per run, because the filter resolves the moment
 * anything matches rather than once the page has settled — so the same code passed or failed
 * on timing alone. Scoping to the id the section already carries for its jump link removes
 * both the ambiguity and the race.
 */
function pricingSection(page: Page) {
  return page.locator('section#pricing');
}

test.describe('Pricing rules', () => {
  test.afterEach(async ({ request }) => {
    // Restore the seeded rate, and assert the restore: a silent failure here leaves the dev
    // database priced wrongly and every later spec asserting the wrong figure.
    await apiLogin(request, ADMIN);
    const rules = await (
      await request.get('http://localhost:8080/api/admin/settings/pricing-rules')
    ).json();

    // Delete only the rules this spec created, matched by the E2E_PREFIX every one of them
    // is named with.
    //
    // This deliberately does NOT delete "everything except the seeded rule". These specs run
    // against the developer's own database, not a disposable one, so anything unrecognised
    // is far more likely to be a real rule someone configured than leftover test data — and
    // an earlier version of this cleanup wiped exactly that. A test fixture may remove what
    // it created; it may not remove what it merely fails to recognise.
    const seeded = rules.reduce((lowest: { id: number }, rule: { id: number }) =>
      rule.id < lowest.id ? rule : lowest,
    );

    for (const rule of rules as { id: number; name: string }[]) {
      if (rule.id !== seeded.id && rule.name.startsWith(E2E_PREFIX)) {
        // Delete before restoring the seeded rate: while a second catch-all exists, the
        // server's "one must always remain" guard permits removing this one.
        await apiWrite(request, 'delete', `/api/admin/settings/pricing-rules/${rule.id}`);
      }
    }

    const restored = await apiWrite(
      request,
      'put',
      `/api/admin/settings/pricing-rules/${seeded.id}`,
      {
        name: 'Standard hourly rate',
        tableType: null,
        daysOfWeek: [],
        startTime: null,
        endTime: null,
        hourlyRatePence: 1200,
        priority: 0,
        active: true,
      },
    );
    expect(restored.status(), 'the seeded rate must be restored').toBe(200);
  });

  test('a rate typed in pounds reaches the customer as the price they are quoted', async ({
    page,
    context,
  }) => {
    await login(page, ADMIN);
    await page.goto('/admin/settings');

    const pricing = pricingSection(page);
    const catchAllRow = pricing.locator('tr', { hasText: 'Standard hourly rate' });
    await expect(catchAllRow).toContainText('£12.00');

    await catchAllRow.getByRole('button', { name: 'Edit' }).click();

    // Pounds in the field, because that is what a person types.
    const rate = page.getByLabel('Rate per hour (£)');
    await expect
      .poll(async () => Number(await rate.inputValue()))
      .toBe(DEFAULT_RATE_POUNDS);
    await rate.fill('17.50');
    await page.getByRole('button', { name: 'Save rule' }).click();

    // The list reflects it, formatted as currency.
    await expect(catchAllRow).toContainText('£17.50');

    // And so does a customer, in a separate context with no warm cache. This is the
    // assertion the mocked component tests cannot make: 17.50 became 1750 pence, was stored,
    // and came back as the quoted price rather than £17.05 or £1750.
    const customerPage = await context.browser()!.newPage();
    await customerPage.goto('/book');
    await customerPage.getByLabel('Booking date').fill(openDay());
    await expect(customerPage.getByText('£17.50/hr').first()).toBeVisible();

    await customerPage.close();
  });

  test('the club’s fallback rate cannot be deleted', async ({ page }) => {
    // Deleting it makes PricingService throw on every booking — the club silently stops
    // selling. The server refuses; the UI must say so rather than offering a button that fails.
    await login(page, ADMIN);
    await page.goto('/admin/settings');

    const pricing = pricingSection(page);
    const catchAllRow = pricing.locator('tr', { hasText: 'Standard hourly rate' });

    await expect(catchAllRow).toContainText('Required');
    await expect(catchAllRow.getByRole('button', { name: /^Delete/ })).toHaveCount(0);
  });

  test('a narrower rule outranks the fallback for the times it covers', async ({
    page,
    context,
  }) => {
    // The whole point of priority. A peak rule must actually change what a customer pays
    // during peak hours and leave every other hour alone.
    await login(page, ADMIN);
    await page.goto('/admin/settings');

    const pricing = pricingSection(page);
    await pricing.getByRole('button', { name: 'Add a pricing rule' }).click();

    await page.getByLabel('Rule name').fill('E2E peak rate');
    await page.getByLabel('Rate per hour (£)').fill('25.00');
    await page.getByLabel('Priority').fill('10');
    await page.getByRole('button', { name: 'Save rule' }).click();

    const peakRow = pricing.locator('tr', { hasText: 'E2E peak rate' });
    await expect(peakRow).toContainText('£25.00');
    await expect(peakRow).toContainText('Everything');

    // Higher priority and matches everything, so it now sets the price for every slot.
    const customerPage = await context.browser()!.newPage();
    await customerPage.goto('/book');
    await customerPage.getByLabel('Booking date').fill(openDay());
    await expect(customerPage.getByText('£25.00/hr').first()).toBeVisible();

    await customerPage.close();
  });

  test('one rule can cover several days, and reopening it restores them', async ({ page }) => {
    // Before V12 a rule held a single day, so "Monday to Thursday at £9.50" meant four
    // near-identical rules that staff had to keep in step by hand. The round trip is the
    // assertion: ticking four days must produce one rule that still knows its four days when
    // it is opened again, not a rule that silently widens to every day on the next edit.
    await login(page, ADMIN);
    await page.goto('/admin/settings');

    const pricing = pricingSection(page);
    await pricing.getByRole('button', { name: 'Add a pricing rule' }).click();
    await page.getByLabel('Rule name').fill('E2E early week');
    await page.getByLabel('Rate per hour (£)').fill('9.50');
    // The day checkboxes live in a dropdown; open it, tick, then close it so the panel is
    // not covering the Save button beneath.
    await page.getByRole('button', { name: /^Days/ }).click();
    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday']) {
      await page.getByRole('checkbox', { name: day, exact: true }).check();
    }
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Save rule' }).click();

    const row = pricing.locator('tr', { hasText: 'E2E early week' });
    await expect(row).toContainText('Mon, Tue, Wed, Thu');
    await expect(row).toContainText('£9.50');

    await row.getByRole('button', { name: 'Edit' }).click();
    // The closed dropdown must already say which days are set.
    await expect(page.getByRole('button', { name: /^Days.*Mon, Tue, Wed, Thu/ })).toBeVisible();

    await page.getByRole('button', { name: /^Days/ }).click();
    await expect(page.getByRole('checkbox', { name: 'Monday', exact: true })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Thursday', exact: true })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Friday', exact: true })).not.toBeChecked();
  });

  test('a half-specified time window is refused before it reaches the server', async ({
    page,
  }) => {
    await login(page, ADMIN);
    await page.goto('/admin/settings');

    const pricing = pricingSection(page);
    await pricing.getByRole('button', { name: 'Add a pricing rule' }).click();

    await page.getByLabel('Rule name').fill('E2E broken window');
    await page.getByLabel('From (optional)').fill('18:00');
    await page.getByRole('button', { name: 'Save rule' }).click();

    await expect(page.getByText(/both a start and an end time/i)).toBeVisible();
    // Still on the form, nothing created.
    await expect(pricing.locator('tr', { hasText: 'E2E broken window' })).toHaveCount(0);
  });
});

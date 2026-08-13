import { expect, test } from '@playwright/test';
import { CUSTOMER, login, nextNonSunday } from './support/helpers';

/**
 * The Phase 2 hard gate: a customer can find a slot and reach payment.
 *
 * <p>Everything up to the Stripe redirect is driven through the browser. Card entry itself
 * is a separate spec (`stripe-checkout.spec.ts`) because it depends on Stripe's hosted page
 * and on live test keys — keeping it apart means this spec, which covers our own code, is
 * not at the mercy of a third party's UI.
 */
test.describe('Booking a table', () => {
  test('a signed-in customer can pick a slot and be sent to payment', async ({ page }) => {
    await login(page, CUSTOMER);

    const date = nextNonSunday();
    await page.goto(`/book`);
    await page.getByLabel('Booking date').fill(date);

    // The grid is server-rendered data, so wait for a real cell rather than a timeout.
    const availableSlot = page.getByRole('button', { name: /— available$/ }).first();
    await expect(availableSlot).toBeVisible();

    const slotName = await availableSlot.getAttribute('aria-label');
    await availableSlot.click();

    // The summary panel is the contract with the user: it must state what they are about to
    // buy and what it costs, before they commit to anything.
    const summary = page.getByRole('complementary');
    await expect(summary).toContainText('Your selection');
    await expect(summary).toContainText(/£\d+\.\d{2}/);
    // The time in the summary must be the slot that was clicked — a panel showing a
    // different slot than the one selected is a booking for the wrong hour.
    const clickedTime = slotName?.split(' — ')[0] ?? '';
    await expect(summary).toContainText(clickedTime);

    // Reaching Stripe is the assertion. The redirect is a full page load to another origin,
    // so waiting for the URL is what "payment started" actually means.
    await page.getByRole('button', { name: 'Book and pay' }).click();
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });

    expect(page.url()).toContain('checkout.stripe.com');
  });

  test('an anonymous visitor can browse the grid but is asked to sign in to book', async ({
    page,
  }) => {
    // Browsing must not require an account: it is the conversion path, and a login wall in
    // front of the prices is the single easiest way to lose a customer.
    await page.goto('/book');
    await page.getByLabel('Booking date').fill(nextNonSunday());

    const availableSlot = page.getByRole('button', { name: /— available$/ }).first();
    await expect(availableSlot).toBeVisible();
    await availableSlot.click();

    const summary = page.getByRole('complementary');
    await expect(summary).toContainText('to book this slot');
    await expect(summary.getByRole('link', { name: 'Sign in' })).toBeVisible();
    // Critically, no way to commit: the button must be absent, not merely disabled.
    await expect(page.getByRole('button', { name: 'Book and pay' })).toHaveCount(0);
  });

  test('the grid explains why a slot cannot be booked rather than just disabling it', async ({
    page,
  }) => {
    // A grey cell with no explanation reads as a broken page. Each unavailable cell carries
    // its reason in the accessible name, which is also the tooltip.
    await page.goto('/book');
    await page.getByLabel('Booking date').fill(nextNonSunday());
    await expect(page.getByRole('button', { name: /— available$/ }).first()).toBeVisible();

    const explained = page.getByRole('button', {
      name: /— (Already booked|Unavailable — maintenance|Table out of service|Time has passed|Too soon to book|Up to .* only|Not enough time before closing)/,
    });
    // The seed guarantees at least one: it books slots and blocks a table tomorrow.
    expect(await explained.count()).toBeGreaterThan(0);
  });

  test('changing the duration changes what can be booked', async ({ page }) => {
    // Duration options come from the server; the client must never derive them, or it will
    // offer lengths the API rejects.
    await page.goto('/book');
    await page.getByLabel('Booking date').fill(nextNonSunday());
    await expect(page.getByRole('button', { name: /— available$/ }).first()).toBeVisible();

    const shortCount = await page.getByRole('button', { name: /— available$/ }).count();

    await page.getByLabel(/duration/i).selectOption('240');
    // A four-hour booking cannot start as late as a 30-minute one, so fewer cells qualify.
    await expect
      .poll(async () => page.getByRole('button', { name: /— available$/ }).count())
      .toBeLessThan(shortCount);
  });
});

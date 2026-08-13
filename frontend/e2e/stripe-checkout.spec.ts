import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { CUSTOMER, login, nextNonSunday } from './support/helpers';

/**
 * Fills Stripe's hosted card form.
 *
 * <p>Checkout renders one of two layouts depending on how many payment methods the account
 * has enabled. With several (Klarna, Revolut, wallets), it shows a method picker and the card
 * fields do not exist until "Card" is chosen — so a spec that types straight into "Card
 * number" hangs until it times out. Handling both means the test does not silently start
 * failing when someone enables a payment method in the Stripe dashboard.
 */
/**
 * Any free cell in the grid, chosen at random.
 *
 * <p>These specs leave real holds behind — the decline test deliberately keeps its slot
 * reserved — so a spec that always picks the first available cell collides with its own
 * previous runs and fails with "that time has just been taken". That failure looks like a
 * bug in the booking flow and is not one.
 */
async function pickRandomFreeSlot(page: Page) {
  const free = page.getByRole('button', { name: /— available$/ });
  await expect(free.first()).toBeVisible();
  const count = await free.count();
  expect(count, 'the grid must offer at least one free slot').toBeGreaterThan(0);
  return free.nth(Math.floor(Math.random() * count));
}

async function payWithCard(page: Page, cardNumber: string) {
  // Stripe's accordion: the "Pay with card" button is present but invisible, and .check() on
  // the radio does not open the panel. Clicking the visible row is what a user does and what
  // actually works. force:true because Stripe overlays the input with its own styling.
  //
  // Retried because the click races Stripe's own hydration: one that lands before the
  // handler is attached is silently swallowed and the panel never opens. Polling for the
  // outcome beats a fixed sleep, which would be either flaky or slow.
  const cardOption = page.getByRole('radio', { name: 'Card' });

  // .first() throughout: Stripe renders a hidden duplicate of the card form for its wallet
  // flow, so several of these labels match twice and an unscoped locator is a strict-mode
  // violation rather than a wrong field.
  const cardNumberField = page.getByLabel('Card number').first();

  // Wait for one of the two layouts to settle before deciding which it is. A bare count() here
  // races the render and returns 0 while the picker is still on its way, so the code silently
  // takes the card-only branch and then waits for fields that will never appear.
  await expect(async () => {
    expect(
      (await cardOption.count()) > 0 || (await cardNumberField.count()) > 0,
      'Checkout should show either a payment-method picker or the card form',
    ).toBe(true);
  }).toPass({ timeout: 30_000 });

  if (await cardOption.count()) {
    // Retried because the click races Stripe's hydration: one that lands before the handler
    // is attached is silently swallowed and the panel never opens.
    await expect(async () => {
      if (!(await cardNumberField.isVisible())) {
        await cardOption.click({ force: true });
      }
      await expect(cardNumberField).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 45_000 });
  }

  await expect(cardNumberField).toBeVisible({ timeout: 20_000 });
  await cardNumberField.fill(cardNumber);
  await page
    .getByLabel(/Expir/)
    .first()
    .fill('12' + String(new Date().getFullYear() + 2).slice(-2));
  await page.getByLabel('CVC').first().fill('123');

  // Present or absent depending on the account's billing-address settings.
  for (const [pattern, value] of [
    [/Name on card|Cardholder name/, 'Test Customer'],
    [/Postal code|ZIP/, 'M1 1AA'],
  ] as const) {
    const field = page.getByLabel(pattern).first();
    if (await field.count()) {
      await field.fill(value);
    }
  }

  await page.getByTestId('hosted-payment-submit-button').click();
}

/**
 * A payment completed end to end, card entry included.
 *
 * <p>Kept separate from `booking-happy-path.spec.ts` on purpose. This one depends on Stripe's
 * hosted page and on live test keys, so it is the spec most likely to break for reasons that
 * have nothing to do with this codebase — a Stripe UI change, a network blip, a missing key.
 * Isolating it means those failures never obscure the specs that cover our own code.
 *
 * <p>It is nonetheless the only test in the suite that proves the whole chain: hold created,
 * Stripe session opened, card charged, webhook received, signature verified, booking
 * confirmed. Every other payment test stubs at least one link of that chain — and the jsonb
 * webhook defect found in Phase 6 sat undetected behind exactly those stubs while 156 tests
 * passed and real customers' bookings stayed unconfirmed.
 */
test.describe('Paying by card', () => {
  // Stripe's hosted page is a third party over the network, and the webhook that confirms
  // the booking arrives asynchronously afterwards.
  test.slow();

  test('a card payment confirms the booking', async ({ page }) => {
    await login(page, CUSTOMER);
    await page.goto('/book');
    await page.getByLabel('Booking date').fill(nextNonSunday(5));

    // A random free cell, not the first. These specs create real PENDING_PAYMENT holds that
    // are not cleaned up (a declined payment deliberately keeps its hold), so always taking
    // the first slot means each run collides with the last one's leftovers and the booking
    // is refused with "that time has just been taken".
    const slot = await pickRandomFreeSlot(page);
    await slot.click();
    await page.getByRole('button', { name: 'Book and pay' }).click();

    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });

    await payWithCard(page, '4242424242424242');

    // Back on our confirmation page.
    await page.waitForURL(/\/bookings\//, { timeout: 60_000 });

    // The booking must end up CONFIRMED. It may pass through "confirming…" first: the
    // webhook and the browser return race, and whichever arrives first wins. Polling is the
    // honest way to assert this — the page itself polls for the same reason.
    //
    // If this hangs on "Confirming your payment…", the usual cause is not a defect here: the
    // Stripe CLI forwarder is not running, so no webhook ever reaches the backend. Named
    // explicitly because the bare failure ("element not found") sends you looking in the
    // wrong place entirely.
    try {
      await expect(page.getByText(/Confirmed/i).first()).toBeVisible({ timeout: 60_000 });
    } catch (cause) {
      const stillConfirming = await page.getByText(/Confirming your payment/i).count();
      if (stillConfirming > 0) {
        throw new Error(
          'The booking never left "Confirming your payment…". The webhook did not arrive — ' +
            'check that `stripe listen --forward-to localhost:8080/api/webhooks/stripe` is ' +
            'running and that the backend was started with that CLI signing secret. ' +
            'See the End-to-end section of the README.',
          { cause },
        );
      }
      throw cause;
    }

    // Not merely a success message: the money and the slot must both be recorded, or the
    // customer has paid for nothing.
    await expect(page.getByText(/SNK-/)).toBeVisible();
    await expect(page.getByText(/£\d+\.\d{2}/).first()).toBeVisible();
  });

  test('a declined card leaves the slot held so the customer can retry', async ({ page }) => {
    // 4000000000000002 always declines. The hold must survive: cancelling the booking on a
    // failed payment would make the customer re-pick a slot that may be gone by then.
    await login(page, CUSTOMER);
    await page.goto('/book');
    await page.getByLabel('Booking date').fill(nextNonSunday(6));

    // A random free cell, not the first. These specs create real PENDING_PAYMENT holds that
    // are not cleaned up (a declined payment deliberately keeps its hold), so always taking
    // the first slot means each run collides with the last one's leftovers and the booking
    // is refused with "that time has just been taken".
    const slot = await pickRandomFreeSlot(page);
    await slot.click();
    await page.getByRole('button', { name: 'Book and pay' }).click();
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });

    // Stripe's "Back" link carries our cancel URL, which contains the booking reference —
    // the only place it is visible from this page.
    const backHref = await page
      .getByRole('link', { name: /^Back to/ })
      .getAttribute('href');
    const reference = backHref?.match(/SNK-[A-Z0-9]+/)?.[0];
    expect(reference, 'the cancel URL should carry the booking reference').toBeTruthy();

    await payWithCard(page, '4000000000000002');

    // Stripe keeps the customer on its own page after a decline. Asserting on the exact
    // wording of Stripe's error would be testing Stripe; what matters here is that the
    // customer was not sent onward as though the payment had worked.
    await page.waitForTimeout(5_000);
    expect(page.url(), 'a declined card must not reach the confirmation page').toContain(
      'checkout.stripe.com',
    );

    // The real assertion: the slot is still held, so the customer can retry rather than
    // discovering their table was released the moment their card was refused.
    const status = await page.request.get(`http://localhost:8080/api/bookings/${reference}`);
    expect(status.ok(), 'the booking must still exist').toBe(true);
    expect(
      (await status.json()).status,
      'a declined payment must leave the hold in place',
    ).toBe('PENDING_PAYMENT');
  });
});

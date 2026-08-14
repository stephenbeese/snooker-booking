import { expect, test } from '@playwright/test';
import { ADMIN, apiLogin, apiWrite, bookingDate, login, releaseBookings } from './support/helpers';

/**
 * Pay on arrival, end to end.
 *
 * <p>The component tests prove the buttons send the right request against a mocked API. What
 * only a real run can show is that the money state staff act on survives the round trip: that a
 * booking taken over the phone comes back owing something, and that recording the payment
 * actually clears it in the database rather than only in a cache.
 *
 * <p>Each test takes its own booking through the API rather than the telephone form, because
 * the form is `telephone-availability.spec.ts`'s subject and not this one's. Every reference is
 * captured and cancelled afterwards — these specs run against a real developer database.
 */
test.describe('Counter payment', () => {
  const created: string[] = [];
  const date = bookingDate('counterPayment');

  test.afterAll(async ({ request }) => {
    await releaseBookings(request, created);
  });

  /**
   * Takes a telephone booking at the given hour and returns its reference.
   *
   * <p>Each test passes its own hour so no two contend for the same cell, and the address is
   * derived from it — a shared customer would be fine, but a distinct one makes it obvious in
   * the database which test left what behind.
   */
  async function takeBooking(
    request: Parameters<typeof apiWrite>[0],
    hour: number,
  ): Promise<string> {
    await apiLogin(request, ADMIN);
    const response = await apiWrite(request, 'post', '/api/admin/bookings/telephone', {
      tableId: 1,
      date,
      startTime: `${String(hour).padStart(2, '0')}:00:00`,
      durationMinutes: 60,
      customerEmail: `counter-${hour}@e2e.test`,
      firstName: 'Counter',
      lastName: 'Caller',
      customerPhone: '07700 900321',
    });
    expect(response.status(), `taking a telephone booking at ${hour}:00`).toBe(201);
    const booking = await response.json();
    created.push(booking.reference);
    return booking.reference;
  }

  test('a telephone booking arrives owing money, and settles when staff record it', async ({
    page,
    request,
  }) => {
    const reference = await takeBooking(request, 14);
    await login(page, ADMIN);
    await page.goto(`/admin/bookings/${reference}`);

    // The prompt carries the amount: staff are about to key it into a card machine.
    await expect(page.getByRole('heading', { name: /to collect/ })).toBeVisible();
    await expect(page.getByText(/pay on arrival/i).first()).toBeVisible();

    await page.getByRole('button', { name: 'Mark as paid' }).click();

    // The prompt must clear on the screen staff are looking at. If it did not, the next person
    // to open this booking would ask a paying customer for money a second time.
    await expect(page.getByRole('heading', { name: /to collect/ })).toBeHidden();
    await expect(page.getByText('Paid at the counter').first()).toBeVisible();

    // And it is genuinely settled, not merely repainted: a fresh request, no cache involved.
    const check = await request.get(`http://localhost:8080/api/admin/bookings/${reference}`);
    const settled = await check.json();
    expect(settled.paymentStatus).toBe('PAID_AT_COUNTER');
    expect(settled.amountOutstandingPence).toBe(0);
    expect(settled.payableAtCounter).toBe(false);
  });

  test('the bookings list flags what is still owed', async ({ page, request }) => {
    const reference = await takeBooking(request, 15);
    await login(page, ADMIN);

    // Found by its own reference rather than by position: this database has other bookings in
    // it, and "the first row" is whatever a developer last created.
    await page.goto(`/admin/bookings?search=${reference}`);

    const row = page.getByRole('row').filter({ hasText: reference });
    await expect(row).toBeVisible();
    await expect(row.getByText(/pay on arrival/i)).toBeVisible();
  });

  test('a booking paid online is never offered a counter payment', async ({ page, request }) => {
    // The guard that matters: the endpoint refuses to record cash against a settled booking, so
    // showing the control would be offering staff a button that can only produce an error.
    const reference = await takeBooking(request, 16);
    await apiWrite(request, 'post', `/api/admin/bookings/${reference}/payment`, {
      status: 'PAID_AT_COUNTER',
    });

    await login(page, ADMIN);
    await page.goto(`/admin/bookings/${reference}`);

    await expect(page.getByText('Paid at the counter').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark as paid' })).toBeHidden();
  });
});

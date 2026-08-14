import { expect, test } from '@playwright/test';
import { login } from './support/helpers';

/**
 * The STAFF/ADMIN split, through a real browser.
 *
 * <p>`AuthorizationBoundaryIT` already proves the API refuses staff the admin-only endpoints,
 * which is the part that actually secures anything. What only a browser can show is the other
 * half: that a staff member is not left staring at a screen of failed requests, and that the
 * navigation offers them the area they are entitled to. A guard that returns the right status
 * code while the UI hides the staff area is still a broken feature.
 *
 * <p>Reads only. Nothing here creates or changes an account, so there is nothing to clean up.
 */

const STAFF = { email: 'staff@snookerclub.test', password: 'Staff123!' };
const ADMIN = { email: 'admin@snookerclub.test', password: 'Admin123!' };

test.describe('Staff permissions', () => {
  test('a staff member reaches the day job', async ({ page }) => {
    await login(page, STAFF);

    // The nav link must be there. It used to be gated on role === 'ADMIN', which would have
    // hidden the staff area from the very role that was added to use it.
    await expect(page.getByRole('link', { name: 'Staff' })).toBeVisible();

    await page.goto('/admin');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await page.goto('/admin/bookings');
    await expect(page.getByRole('heading', { name: /bookings/i })).toBeVisible();

    await page.goto('/admin/bookings/telephone');
    await expect(page.getByRole('heading', { name: /new booking/i })).toBeVisible();

    await page.goto('/admin/maintenance');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('a staff member is refused the club’s configuration', async ({ page }) => {
    await login(page, STAFF);

    for (const path of ['/admin/settings', '/admin/tables', '/admin/users']) {
      await page.goto(path);
      await expect(page.getByText(/managers only/i)).toBeVisible();
    }

    // And is offered the way back to work rather than a customer page: they do work here.
    //
    // Exact, because /dashboard/i also matches the nav's own "Dashboard" link — two elements,
    // which Playwright's strict mode refuses. Both point at /admin, so the assertion always
    // held; it just could not be evaluated.
    await expect(
      page.getByRole('link', { name: 'Back to the dashboard', exact: true }),
    ).toHaveAttribute('href', '/admin');
  });

  test('the API refuses staff even when the browser is bypassed', async ({ page }) => {
    // The assertion that matters. The guard above only decides what renders; anyone can edit
    // their role in memory, so the server has to refuse independently.
    await page.goto('/login');
    await page.getByLabel('Email address').fill(STAFF.email);
    await page.getByLabel('Password').fill(STAFF.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).not.toHaveURL(/\/login/);

    // Same cookie jar as the page, via the page's own context.
    const status = await page.evaluate(async () => {
      const response = await fetch('/api/admin/users', { credentials: 'include' });
      return response.status;
    });
    expect(status, 'staff must not be able to read the user directory').toBe(403);

    const promote = await page.evaluate(async () => {
      const csrf = document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1] ?? '';
      const response = await fetch('/api/admin/users/1/role', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': decodeURIComponent(csrf) },
        body: JSON.stringify({ role: 'ADMIN' }),
      });
      return response.status;
    });
    expect(promote, 'staff must not be able to hand out roles — including to themselves').toBe(
      403,
    );
  });

  test('an admin reaches everything, including the people screen', async ({ page }) => {
    // The mirror image. Without it, a guard that refused everyone would pass every test above
    // while locking the club out of its own configuration.
    await login(page, ADMIN);

    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { name: 'Manage staff' })).toBeVisible();

    await page.goto('/admin/settings');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('an admin cannot strip their own access', async ({ page }) => {
    // The control is disabled rather than offered-and-refused: the server rejects it, so a
    // live control would exist only to produce an error.
    await login(page, ADMIN);
    await page.goto('/admin/users');

    const ownRow = page.locator('tr', { hasText: 'Club Manager' }).first();
    await expect(ownRow.getByText('(you)')).toBeVisible();
    await expect(ownRow.getByRole('combobox')).toBeDisabled();
    await expect(ownRow.getByRole('button', { name: 'Deactivate' })).toBeDisabled();
  });
});

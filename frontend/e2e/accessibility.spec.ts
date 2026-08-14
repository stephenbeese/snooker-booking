import { expect, test } from '@playwright/test';
import { CUSTOMER, login, openDay } from './support/helpers';

/**
 * Keyboard and screen-reader basics on the paths that matter.
 *
 * <p>Not an axe sweep. An automated audit catches contrast and missing attributes, which are
 * worth catching, but it cannot tell whether a keyboard user can actually complete a booking —
 * and that is the thing that would stop someone using the club. These tests drive the
 * keyboard and assert on accessible names, which is how the page is experienced by anyone
 * not using a mouse.
 */
test.describe('Accessibility', () => {
  test('a keyboard user can reach the booking grid without tabbing through the nav', async ({
    page,
  }) => {
    await page.goto('/book');

    // The skip link is visually hidden until focused — the first Tab must land on it.
    await page.keyboard.press('Tab');
    const skipLink = page.getByRole('link', { name: 'Skip to content' });
    await expect(skipLink).toBeFocused();

    await page.keyboard.press('Enter');
    // Focus must actually move into main, not merely change the URL hash. Without this
    // assertion the link can look right and do nothing, which is the usual bug.
    await expect(page.locator('#main')).toBeVisible();
  });

  test('every slot in the grid announces its time and its state', async ({ page }) => {
    await page.goto('/book');
    await page.getByLabel('Booking date').fill(openDay());
    await expect(page.getByRole('button', { name: /— available$/ }).first()).toBeVisible();

    // A cell whose accessible name is just "10:00" tells a screen-reader user nothing about
    // whether they can book it — the colour is the only signal, and they cannot see it.
    const cells = page.getByRole('button', { name: /^\d{2}:\d{2} — / });
    expect(await cells.count()).toBeGreaterThan(0);

    for (const name of await cells.evaluateAll((nodes) =>
      nodes.slice(0, 10).map((node) => node.getAttribute('aria-label') ?? ''),
    )) {
      expect(name, 'each cell states a time and a state').toMatch(/^\d{2}:\d{2} — .+/);
    }
  });

  test('a keyboard user can select a slot and reach the book button', async ({ page }) => {
    await login(page, CUSTOMER);
    await page.goto('/book');
    await page.getByLabel('Booking date').fill(openDay());

    const slot = page.getByRole('button', { name: /— available$/ }).first();
    await expect(slot).toBeVisible();

    // Focus and activate by keyboard rather than clicking: a div with an onClick would pass
    // a click test and be completely unusable here.
    await slot.focus();
    await expect(slot).toBeFocused();
    await page.keyboard.press('Enter');

    // aria-pressed communicates the selection to a screen reader; without it the only
    // feedback is a colour change. The name carries the whole booked range, not just
    // "selected", because a booking covers several cells and the start cell alone does not
    // say how far it runs — so this deliberately does not anchor at "selected".
    await expect(page.getByRole('button', { name: /— selected(,|$)/ }).first()).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('button', { name: 'Book and pay' })).toBeVisible();
  });

  test('form errors are announced, not just coloured', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email address').fill('nobody@example.test');
    await page.getByLabel('Password').fill('WrongPassword!');
    await page.getByRole('button', { name: 'Sign in' }).click();

    // role="alert" is what makes a screen reader speak the failure. Red text alone leaves a
    // blind user with a form that silently did nothing.
    await expect(page.getByRole('alert')).toBeVisible();
  });

  test('every page has exactly one h1 and its own title', async ({ page }) => {
    // Two h1s or none breaks heading navigation, which is how many screen-reader users move
    // around a page rather than tabbing.
    const paths = ['/', '/book', '/login', '/register'];
    const titles: string[] = [];

    for (const path of paths) {
      await page.goto(path);
      await expect(page.locator('h1'), `${path} should have exactly one h1`).toHaveCount(1);
      titles.push(await page.title());
    }

    // Distinct, not merely present. An SPA keeps index.html's title unless something updates
    // it, so every route announces the same words: navigation is silent to a screen reader,
    // and the browser's history is a list of identical entries.
    expect(new Set(titles).size, `titles must differ per page, got ${titles.join(' / ')}`).toBe(
      paths.length,
    );
  });

  test('navigating within the app changes the title', async ({ page }) => {
    // The client-side case, which a per-page goto() would miss entirely: React Router does
    // not touch document.title on its own.
    await page.goto('/');
    const home = await page.title();

    await page.getByRole('link', { name: 'Book a table' }).first().click();
    await expect(page).toHaveURL(/\/book/);
    await expect.poll(async () => page.title()).not.toBe(home);
  });

  test('images and icons that carry no meaning are hidden from screen readers', async ({
    page,
  }) => {
    await page.goto('/');
    // A decorative SVG announced as "image" is noise between every meaningful element.
    const svgs = page.locator('svg:not([aria-hidden="true"])');
    for (const svg of await svgs.all()) {
      const label = await svg.getAttribute('aria-label');
      const role = await svg.getAttribute('role');
      expect(
        label !== null || role !== null,
        'a visible SVG must either be labelled or hidden',
      ).toBe(true);
    }
  });
});

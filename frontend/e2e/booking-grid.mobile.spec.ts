import { expect, test } from '@playwright/test';
import { CUSTOMER, login, openDay } from './support/helpers';

/**
 * The booking grid on a phone.
 *
 * <p>Its own project (see `playwright.config.ts`) rather than a resize inside another spec,
 * because the Pixel 7 profile also switches on touch and a mobile user agent — a resized
 * desktop browser still reports hover support and would pass tests a real phone fails.
 *
 * <p>Most customers will book on a phone, and the grid is a wide table: it is the single
 * place where a mobile layout is most likely to break.
 */
test.describe('Booking grid on a phone', () => {
  test('the page never scrolls sideways, however wide the grid', async ({ page }) => {
    await page.goto('/book');
    await page.getByLabel('Booking date').fill(openDay());
    await expect(page.getByRole('button', { name: /— available$/ }).first()).toBeVisible();

    // The grid is deliberately wider than the screen; the scroll must live on its own
    // container. A body that scrolls horizontally makes the whole page feel broken — every
    // vertical swipe drifts and the header slides away.
    const bodyOverflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(bodyOverflows, 'the page body must not scroll horizontally').toBe(false);
  });

  test('the grid itself scrolls, so later times are reachable', async ({ page }) => {
    await page.goto('/book');
    await page.getByLabel('Booking date').fill(openDay());
    await expect(page.getByRole('button', { name: /— available$/ }).first()).toBeVisible();

    // The inverse of the test above: it would also pass if the grid were simply cut off and
    // the late-evening slots unreachable, which is a worse failure than a scrolling body.
    const scroller = page.locator('div.overflow-x-auto').first();
    const canScroll = await scroller.evaluate((node) => node.scrollWidth > node.clientWidth);
    expect(canScroll, 'the grid container must be scrollable').toBe(true);

    await scroller.evaluate((node) => node.scrollBy({ left: 400 }));
    expect(await scroller.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
  });

  test('the table name column stays visible while scrolling the times', async ({ page }) => {
    // Without a sticky first column, scrolling to 21:00 leaves a grid of anonymous cells and
    // no way to tell which row is which table.
    await page.goto('/book');
    await page.getByLabel('Booking date').fill(openDay());

    const firstRowHeader = page.getByRole('rowheader').first();
    await expect(firstRowHeader).toBeVisible();

    const scroller = page.locator('div.overflow-x-auto').first();
    await scroller.evaluate((node) => node.scrollBy({ left: 500 }));

    await expect(firstRowHeader, 'the table name must survive a horizontal scroll').toBeVisible();
    const box = await firstRowHeader.boundingBox();
    expect(box, 'the row header must still be on screen').not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(-1);
  });

  test('the selection summary stays reachable without scrolling back', async ({ page }) => {
    await login(page, CUSTOMER);
    await page.goto('/book');
    await page.getByLabel('Booking date').fill(openDay());

    const slot = page.getByRole('button', { name: /— available$/ }).first();
    await expect(slot).toBeVisible();
    await slot.click();

    // Sticky: the grid is taller than a phone screen, and a summary that scrolls away takes
    // the "Book and pay" button with it — the user selects a slot and cannot find how to buy.
    const bookButton = page.getByRole('button', { name: 'Book and pay' });
    await expect(bookButton).toBeInViewport();

    await page.mouse.wheel(0, 400);
    await expect(bookButton, 'the book button must remain on screen').toBeInViewport();
  });

  test('the navigation collapses into a labelled menu', async ({ page }) => {
    await page.goto('/');

    const toggle = page.getByRole('button', { name: 'Open menu' });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await toggle.click();
    await expect(page.getByRole('button', { name: 'Close menu' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    // Scoped to the menu: the home page has its own call-to-action links with the same text,
    // and an unscoped match would pass even if the menu rendered empty.
    await expect(
      page.locator('#mobile-menu').getByRole('link', { name: 'Book a table' }),
    ).toBeVisible();
  });

  test('tap targets in the grid are big enough to hit', async ({ page }) => {
    await page.goto('/book');
    await page.getByLabel('Booking date').fill(openDay());
    const slot = page.getByRole('button', { name: /— available$/ }).first();
    await expect(slot).toBeVisible();

    // 24px is the WCAG 2.2 AA minimum (2.5.8). Cells below it are missed on a phone, and a
    // mis-tap in this grid books the wrong hour.
    const box = await slot.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(24);
    expect(box!.width).toBeGreaterThanOrEqual(24);
  });
});

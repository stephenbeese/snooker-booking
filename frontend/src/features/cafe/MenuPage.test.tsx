import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithRouter } from '@/test/renderWithProviders';
import { MenuPage } from './MenuPage';

const MENU = [
  {
    id: 1,
    name: 'Flat white',
    description: 'Local roast',
    pricePence: 275,
    imageUrl: 'https://images.test/flat-white.jpg',
  },
  { id: 2, name: 'Tea', description: null, pricePence: 180, imageUrl: null },
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockMenu(items: unknown = MENU) {
  vi.stubGlobal('fetch', vi.fn(async () => json(items)));
}

function render() {
  return renderWithRouter(<MenuPage />, { route: '/menu', path: '/menu' });
}

describe('MenuPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders prices as sterling from integer pence', async () => {
    mockMenu();
    render();

    expect(await screen.findByText('Flat white')).toBeInTheDocument();
    expect(screen.getByText('£2.75')).toBeInTheDocument();
    expect(screen.getByText('£1.80')).toBeInTheDocument();
  });

  it('shows an image when one is set and nothing when it is not', async () => {
    // The image URL is the field that had no reader at all until this page existed. An item
    // without one must still render, rather than leaving a broken image on the menu.
    mockMenu();
    render();

    await screen.findByText('Flat white');
    expect(document.querySelector('img')).toHaveAttribute(
      'src',
      'https://images.test/flat-white.jpg',
    );
    // One image for two items: Tea has no URL, and must render without a broken one.
    expect(document.querySelectorAll('img')).toHaveLength(1);
    expect(screen.getByText('Tea')).toBeInTheDocument();
  });

  it('gives the image an empty alt, since the name is already beside it', async () => {
    // A repeated name makes a screen reader announce the item twice. The picture is
    // decoration here, not information.
    mockMenu();
    render();

    await screen.findByText('Flat white');
    expect(document.querySelector('img')).toHaveAttribute('alt', '');
  });

  it('says so plainly when everything has been withdrawn', async () => {
    // Reachable whenever every item is inactive. An empty page would read as broken.
    mockMenu([]);
    render();

    expect(await screen.findByText(/nothing on the menu/i)).toBeInTheDocument();
  });

  it('surfaces a load failure without a stack trace', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ code: 'NOT_FOUND', message: 'No menu found.' }, 404)),
    );
    render();

    expect(await screen.findByRole('alert')).toHaveTextContent('No menu found.');
  });
});

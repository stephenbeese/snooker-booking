import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithRouter } from '@/test/renderWithProviders';
import { AdminCafePage } from './AdminCafePage';

const ITEMS = [
  {
    id: 1,
    name: 'Flat white',
    description: 'Local roast',
    pricePence: 275,
    imageUrl: null,
    displayOrder: 0,
    active: true,
  },
  {
    id: 2,
    name: 'Discontinued crisps',
    description: null,
    pricePence: 120,
    imageUrl: null,
    displayOrder: 1,
    active: false,
  },
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockApi() {
  const calls: { url: string; method: string; body: string | null }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      calls.push({ url, method, body: typeof init?.body === 'string' ? init.body : null });

      if (url.includes('/api/admin/cafe/items')) {
        return method === 'GET' ? json(ITEMS) : json(ITEMS[0]);
      }
      return new Response(null, { status: 204 });
    }),
  );
  return calls;
}

function render() {
  return renderWithRouter(<AdminCafePage />, { route: '/admin/cafe', path: '/admin/cafe' });
}

describe('AdminCafePage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders prices as sterling from integer pence', async () => {
    mockApi();
    render();

    expect(await screen.findByText('£2.75')).toBeInTheDocument();
    expect(screen.getByText('£1.20')).toBeInTheDocument();
  });

  it('sends pounds typed by staff as integer pence', async () => {
    // The conversion this page exists to get right. "2.50" reaching the server as 2.5, or as
    // the string "2.50", is a mispriced menu — and 12.15 * 100 in binary is 1214.999…, which
    // is why the shared helper rounds rather than truncates.
    const calls = mockApi();
    const user = userEvent.setup();
    render();

    await user.type(await screen.findByLabelText('Name'), 'Lime soda');
    await user.type(screen.getByLabelText('Price'), '12.15');
    await user.click(screen.getByRole('button', { name: 'Add item' }));

    await waitFor(() => {
      const post = calls.find((call) => call.method === 'POST');
      expect(JSON.parse(post?.body ?? '{}')).toMatchObject({
        name: 'Lime soda',
        pricePence: 1215,
      });
    });
  });

  it('refuses an empty price rather than saving the item as free', async () => {
    // z.coerce.number() would turn "" into 0 and save this silently at £0.00, which is the
    // trap this field's validation is written around.
    const calls = mockApi();
    const user = userEvent.setup();
    render();

    await user.type(await screen.findByLabelText('Name'), 'Priceless');
    await user.click(screen.getByRole('button', { name: 'Add item' }));

    expect(await screen.findByText('Give the item a price')).toBeInTheDocument();
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('refuses a negative price', async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    render();

    await user.type(await screen.findByLabelText('Name'), 'Refund special');
    await user.type(screen.getByLabelText('Price'), '-1');
    await user.click(screen.getByRole('button', { name: 'Add item' }));

    expect(await screen.findByText('A price cannot be negative')).toBeInTheDocument();
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('allows a free item, since zero is a real price', async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    render();

    await user.type(await screen.findByLabelText('Name'), 'Tap water');
    await user.type(screen.getByLabelText('Price'), '0');
    await user.click(screen.getByRole('button', { name: 'Add item' }));

    await waitFor(() => {
      const post = calls.find((call) => call.method === 'POST');
      expect(JSON.parse(post?.body ?? '{}').pricePence).toBe(0);
    });
  });

  it('loads a price back into the form as a plain number, not as £2.75', async () => {
    // formatPence here would put "£2.75" into the field, and the £ makes it unparseable on
    // the way back out — so editing anything else about the item would fail on the price.
    mockApi();
    const user = userEvent.setup();
    render();

    await user.click((await screen.findAllByRole('button', { name: 'Edit' }))[0]!);

    expect(screen.getByLabelText('Price')).toHaveValue('2.75');
  });

  it('shows a withdrawn item with a way to put it back', async () => {
    // Withdrawn items must stay visible to staff: invisible would leave them unable to
    // reinstate one, and unsure whether it was ever there.
    mockApi();
    render();

    const row = (await screen.findByText('Discontinued crisps')).closest('tr')!;
    expect(within(row).getByText('Withdrawn')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Put back' })).toBeInTheDocument();
  });

  it('confirms a save by name and price', async () => {
    mockApi();
    const user = userEvent.setup();
    render();

    await user.type(await screen.findByLabelText('Name'), 'Lime soda');
    await user.type(screen.getByLabelText('Price'), '2.50');
    await user.click(screen.getByRole('button', { name: 'Add item' }));

    expect(await screen.findByText('Lime soda added at £2.50.')).toBeInTheDocument();
  });
});

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
    categoryCode: 'HOT_DRINKS',
    displayOrder: 0,
    active: true,
  },
  {
    id: 2,
    name: 'Discontinued crisps',
    description: null,
    pricePence: 120,
    imageUrl: null,
    // A category the club has since withdrawn: absent from the picker, but still the heading
    // this item is filed under.
    categoryCode: 'RETIRED_SECTION',
    displayOrder: 1,
    active: false,
  },
];

const CATEGORIES = [
  { code: 'HOT_DRINKS', label: 'Hot drinks', displayOrder: 0, active: true },
  { code: 'FOOD', label: 'Food', displayOrder: 1, active: true },
  { code: 'RETIRED_SECTION', label: 'Retired section', displayOrder: 2, active: false },
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

      // Before the items branch: "/categories" is a different path and would otherwise never
      // be reached, since neither string contains the other.
      if (url.includes('/api/admin/cafe/categories')) {
        return method === 'GET' ? json(CATEGORIES) : json(CATEGORIES[0]);
      }
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

  it('offers only assignable categories, plus uncategorised', async () => {
    // A withdrawn category must not be offered: the server refuses it, so an option for it
    // would be one that always fails.
    mockApi();
    render();

    const picker = await screen.findByLabelText('Category');
    expect(within(picker).getByRole('option', { name: 'Hot drinks' })).toBeInTheDocument();
    expect(within(picker).getByRole('option', { name: 'Uncategorised' })).toBeInTheDocument();
    expect(within(picker).queryByRole('option', { name: 'Retired section' })).toBeNull();
  });

  it('sends the chosen category, and null when none is chosen', async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    render();

    await user.type(await screen.findByLabelText('Name'), 'Lime soda');
    await user.type(screen.getByLabelText('Price'), '2.50');
    await user.selectOptions(screen.getByLabelText('Category'), 'FOOD');
    await user.click(screen.getByRole('button', { name: 'Add item' }));

    await waitFor(() => {
      const post = calls.find((call) => call.method === 'POST' && call.url.includes('/items'));
      expect(JSON.parse(post?.body ?? '{}').categoryCode).toBe('FOOD');
    });
  });

  it('sends null rather than an empty string for an uncategorised item', async () => {
    // "" would reach the foreign key as a category code that cannot exist, and fail as a 500
    // rather than being stored as uncategorised.
    const calls = mockApi();
    const user = userEvent.setup();
    render();

    await user.type(await screen.findByLabelText('Name'), 'Pork scratchings');
    await user.type(screen.getByLabelText('Price'), '1.50');
    await user.click(screen.getByRole('button', { name: 'Add item' }));

    await waitFor(() => {
      const post = calls.find((call) => call.method === 'POST' && call.url.includes('/items'));
      expect(JSON.parse(post?.body ?? '{}').categoryCode).toBeNull();
    });
  });

  it('shows a withdrawn category by its own label', async () => {
    mockApi();
    render();

    const row = (await screen.findByText('Discontinued crisps')).closest('tr')!;
    expect(within(row).getByText('Retired section')).toBeInTheDocument();
  });

  it('falls back to the raw code when the category is not in the list at all', async () => {
    // Reachable while the categories request is still in flight, or if an item references a
    // code the list does not carry. A blank cell would leave staff unable to see what the item
    // is filed under, or why it is not where they expected — the code is a poor label but a
    // far better one than nothing.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        // Deliberately empty: nothing here can resolve GHOST_SECTION to a label.
        if (url.includes('/api/admin/cafe/categories')) return json([]);
        if (url.includes('/api/admin/cafe/items')) {
          return json([{ ...ITEMS[0], categoryCode: 'GHOST_SECTION' }]);
        }
        return new Response(null, { status: 204 });
      }),
    );
    render();

    const row = (await screen.findByText('Flat white')).closest('tr')!;
    expect(within(row).getByText('GHOST_SECTION')).toBeInTheDocument();
  });

  it('adds a category and confirms it by name', async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    render();

    await user.type(await screen.findByLabelText('New category'), 'Cocktails');
    await user.click(screen.getByRole('button', { name: 'Add category' }));

    await waitFor(() => {
      const post = calls.find((call) => call.method === 'POST' && call.url.includes('/categories'));
      expect(JSON.parse(post?.body ?? '{}').label).toBe('Cocktails');
    });
    // Named from the server's response, not from what was typed — the server is what decides
    // the stored label.
    expect(await screen.findByText('Category “Hot drinks” added.')).toBeInTheDocument();
  });

  it('surfaces the refusal when a category in use cannot be withdrawn', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = (init?.method ?? 'GET').toUpperCase();
        if (url.includes('/api/admin/cafe/categories') && method === 'PUT') {
          return json(
            { code: 'CONFLICT', message: 'There is 1 item in this category. Move it elsewhere first.' },
            422,
          );
        }
        if (url.includes('/api/admin/cafe/categories')) return json(CATEGORIES);
        if (url.includes('/api/admin/cafe/items')) return json(ITEMS);
        return new Response(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    render();

    await user.click((await screen.findAllByRole('button', { name: 'Withdraw' }))[0]!);

    expect(await screen.findByRole('alert')).toHaveTextContent('Move it elsewhere first.');
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

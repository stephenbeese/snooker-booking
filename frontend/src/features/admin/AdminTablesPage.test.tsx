import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithRouter } from '@/test/renderWithProviders';
import { AdminTablesPage } from './AdminTablesPage';

const TABLES = [
  {
    id: 1,
    name: 'Table 1',
    tableType: 'SNOOKER',
    displayOrder: 0,
    active: true,
    notes: null,
  },
  {
    id: 2,
    name: 'Table 2',
    tableType: 'ENGLISH_POOL',
    displayOrder: 1,
    active: true,
    notes: null,
  },
  {
    id: 3,
    name: 'Table 3',
    // A type the club has since withdrawn: still carried by this table, so absent from the
    // active list the pickers are filled from.
    tableType: 'RETIRED_FORMAT',
    displayOrder: 2,
    active: false,
    notes: null,
  },
];

const TABLE_TYPES = [
  { code: 'SNOOKER', label: 'Snooker' },
  { code: 'ENGLISH_POOL', label: 'English pool' },
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

      if (url.includes('/api/tables/types')) return json(TABLE_TYPES);
      // Before the bare /api/admin/tables branch: "/order" would otherwise be swallowed by
      // it and the reorder assertions would pass against a request that never happened.
      if (url.includes('/api/admin/tables/order')) return json(TABLES);
      if (url.includes('/api/admin/tables')) return json(TABLES);
      return new Response(null, { status: 204 });
    }),
  );
  return calls;
}

function render() {
  return renderWithRouter(<AdminTablesPage />, {
    route: '/admin/tables',
    path: '/admin/tables',
  });
}

describe('AdminTablesPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('offers the types the server knows about rather than a hardcoded list', async () => {
    mockApi();
    render();

    const picker = await screen.findByLabelText('Type');
    expect(within(picker).getByRole('option', { name: 'English pool' })).toBeInTheDocument();
    expect(within(picker).queryByRole('option', { name: 'American pool' })).toBeNull();
  });

  it('shows the code when a table carries a type that is no longer offered', async () => {
    // The label lookup has to degrade to the code. A withdrawn type is absent from the
    // active list, and rendering nothing — or "undefined" — would leave staff unable to see
    // what the table actually is.
    mockApi();
    render();

    expect(await screen.findByText('RETIRED_FORMAT')).toBeInTheDocument();
  });

  it('sends every table id in the new order when one is moved down', async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    render();

    await user.click(await screen.findByRole('button', { name: 'Move Table 1 down' }));

    await waitFor(() => {
      const put = calls.find(
        (call) => call.method === 'PUT' && call.url.includes('/tables/order'),
      );
      // The whole list, reordered — not just the table that moved. The server refuses a
      // partial list, because omitted tables would keep positions that interleave
      // unpredictably with the new order.
      expect(JSON.parse(put?.body ?? '{}').tableIds).toEqual([2, 1, 3]);
    });
  });

  it('sends the reverse order when a table is moved up', async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    render();

    await user.click(await screen.findByRole('button', { name: 'Move Table 3 up' }));

    await waitFor(() => {
      const put = calls.find(
        (call) => call.method === 'PUT' && call.url.includes('/tables/order'),
      );
      expect(JSON.parse(put?.body ?? '{}').tableIds).toEqual([1, 3, 2]);
    });
  });

  it('shuffles the tables between when one is dragged past another', async () => {
    // The distinguishing case for non-adjacent moves. Dropping table 1 onto table 3 must
    // give [2,3,1] — every table between them shifting up one. A swap would give [3,2,1],
    // which is identical for adjacent moves and wrong for every longer drag, so the arrow
    // tests above cannot catch it.
    const calls = mockApi();
    render();

    const rows = await screen.findAllByRole('row');
    // rows[0] is the header; rows[1..3] are tables 1, 2 and 3.
    fireEvent.dragStart(rows[1]!);
    fireEvent.dragOver(rows[3]!);
    fireEvent.drop(rows[3]!);

    await waitFor(() => {
      const put = calls.find(
        (call) => call.method === 'PUT' && call.url.includes('/tables/order'),
      );
      expect(JSON.parse(put?.body ?? '{}').tableIds).toEqual([2, 3, 1]);
    });
  });

  it('cannot move the first table up or the last one down', async () => {
    // Both would be no-ops, and a live button that does nothing reads as a broken one.
    mockApi();
    render();

    expect(await screen.findByRole('button', { name: 'Move Table 1 up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Table 3 down' })).toBeDisabled();
  });

  it('gives every reorder control a name that says which table it moves', async () => {
    // Six identical arrows would be unusable with a screen reader, and dragging is not an
    // alternative for anyone using one.
    mockApi();
    render();

    expect(await screen.findByRole('button', { name: 'Move Table 2 up' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move Table 2 down' })).toBeInTheDocument();
  });
});

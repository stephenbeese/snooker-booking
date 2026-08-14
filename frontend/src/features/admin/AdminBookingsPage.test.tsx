import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { todayIso } from '@/lib/datetime';
import { makeAdminBooking } from '@/test/factories';
import { renderWithRouter } from '@/test/renderWithProviders';
import { AdminBookingsPage } from './AdminBookingsPage';
import type { AdminBooking } from './types';

/** Records the URLs requested, so the tests can assert what was actually asked of the server. */
function mockApi(bookings: AdminBooking[]) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);

      if (url.includes('/api/tables')) {
        return json([
          { id: 1, name: 'Table 1', tableType: 'SNOOKER', displayOrder: 1, active: true },
          { id: 2, name: 'Table 2', tableType: 'SNOOKER', displayOrder: 2, active: true },
        ]);
      }
      if (url.includes('/api/admin/bookings')) {
        return json({
          items: bookings,
          page: 0,
          size: 25,
          totalItems: bookings.length,
          totalPages: 1,
        });
      }
      return new Response(null, { status: 204 });
    }),
  );
  return calls;
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function bookingUrls(calls: string[]) {
  return calls.filter((url) => url.includes('/api/admin/bookings'));
}

describe('AdminBookingsPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists bookings with the customer details staff need', async () => {
    mockApi([makeAdminBooking()]);
    renderWithRouter(<AdminBookingsPage />, { route: '/admin/bookings', path: '/admin/bookings' });

    expect(await screen.findByText('SNK-ABC123')).toBeInTheDocument();
    expect(screen.getByText('Test Customer')).toBeInTheDocument();
    // The email is the whole reason the admin DTO differs from the customer one.
    expect(screen.getByText('customer@test.local')).toBeInTheDocument();
  });

  it('flags what is owed at the counter, without flagging what is already paid', async () => {
    // Both rows in one render: the badge must distinguish them, not simply appear. A test with
    // only the unpaid row would pass against a badge that showed on every booking.
    mockApi([
      makeAdminBooking({
        reference: 'SNK-PHONE1',
        source: 'TELEPHONE',
        paymentStatus: 'REQUIRES_PAYMENT',
        amountOutstandingPence: 1200,
        payableAtCounter: true,
      }),
      makeAdminBooking({ reference: 'SNK-ONLINE' }),
    ]);
    renderWithRouter(<AdminBookingsPage />, { route: '/admin/bookings', path: '/admin/bookings' });

    // Staff scan this list to see who owes money on arrival, so the amount is on the row.
    expect(await screen.findByText(/pay on arrival — £12\.00 due/i)).toBeInTheDocument();
    expect(screen.getAllByText(/pay on arrival/i)).toHaveLength(1);
  });

  it('says so plainly when nothing matches', async () => {
    mockApi([]);
    renderWithRouter(<AdminBookingsPage />, { route: '/admin/bookings', path: '/admin/bookings' });

    expect(await screen.findByText(/no bookings match/i)).toBeInTheDocument();
  });

  it('sends the filters from the URL to the server', async () => {
    // Filters live in the URL so they can be shared and survive a refresh; this asserts they
    // are actually applied rather than merely displayed.
    const calls = mockApi([makeAdminBooking()]);
    renderWithRouter(<AdminBookingsPage />, {
      route: '/admin/bookings?status=CANCELLED&tableId=2&search=smith',
      path: '/admin/bookings',
    });

    await screen.findByText('SNK-ABC123');

    const requested = bookingUrls(calls)[0] ?? '';
    expect(requested).toContain('status=CANCELLED');
    expect(requested).toContain('tableId=2');
    expect(requested).toContain('search=smith');
  });

  it('asks the server again when a status filter is toggled', async () => {
    const calls = mockApi([makeAdminBooking()]);
    const user = userEvent.setup();
    renderWithRouter(<AdminBookingsPage />, { route: '/admin/bookings', path: '/admin/bookings' });

    await screen.findByText('SNK-ABC123');
    const before = bookingUrls(calls).length;

    await user.click(screen.getByRole('button', { name: /cancelled/i }));

    // Filtering must be server-side: a client-side filter over one page would silently hide
    // matching rows that live on the pages it never fetched.
    await waitFor(() => {
      const urls = bookingUrls(calls);
      expect(urls.length).toBeGreaterThan(before);
      expect(urls[urls.length - 1]).toContain('status=CANCELLED');
    });
  });

  it('drops a nonsense page number instead of sending it on', async () => {
    const calls = mockApi([makeAdminBooking()]);
    renderWithRouter(<AdminBookingsPage />, {
      route: '/admin/bookings?page=banana',
      path: '/admin/bookings',
    });

    await screen.findByText('SNK-ABC123');

    expect(bookingUrls(calls)[0]).not.toContain('page=');
  });

  it('searches as you type, without a button', async () => {
    // Every other filter on this form applies on change. The search box used to be the one
    // that demanded a submit, which is the inconsistency this replaces.
    const calls = mockApi([makeAdminBooking()]);
    const user = userEvent.setup();
    renderWithRouter(<AdminBookingsPage />, { route: '/admin/bookings', path: '/admin/bookings' });

    await screen.findByText('SNK-ABC123');
    await user.type(screen.getByLabelText('Search'), 'smith');

    await waitFor(() => {
      expect(bookingUrls(calls).at(-1)).toContain('search=smith');
    });
  });

  it('sends one request for a whole word, not one per keystroke', async () => {
    // The reason the debounce exists. Five requests for "smith" can also land out of order, so
    // the rows shown would be whichever response was slowest rather than the one for the term
    // in the box.
    const calls = mockApi([makeAdminBooking()]);
    const user = userEvent.setup();
    renderWithRouter(<AdminBookingsPage />, { route: '/admin/bookings', path: '/admin/bookings' });

    await screen.findByText('SNK-ABC123');
    const before = bookingUrls(calls).length;

    await user.type(screen.getByLabelText('Search'), 'smith');
    await waitFor(() => {
      expect(bookingUrls(calls).at(-1)).toContain('search=smith');
    });

    // One more than we started with. A per-keystroke implementation makes five.
    expect(bookingUrls(calls).length - before).toBe(1);
  });

  it('narrows to today at both ends of the range', async () => {
    const calls = mockApi([makeAdminBooking()]);
    const user = userEvent.setup();
    renderWithRouter(<AdminBookingsPage />, { route: '/admin/bookings', path: '/admin/bookings' });

    await screen.findByText('SNK-ABC123');
    await user.click(screen.getByRole('button', { name: 'Today' }));

    // Both `from` and `to`. Setting only `from` answers "today onwards", which is a different
    // question from the one a button called Today is asking.
    await waitFor(() => {
      const requested = bookingUrls(calls).at(-1) ?? '';
      const today = todayIso();
      expect(requested).toContain(`from=${today}`);
      expect(requested).toContain(`to=${today}`);
    });
  });
});

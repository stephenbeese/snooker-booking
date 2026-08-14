import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeAdminCustomer } from '@/test/factories';
import { renderWithRouter } from '@/test/renderWithProviders';
import { AdminCustomersPage } from './AdminCustomersPage';
import type { AdminCustomer } from './types';

/** Records the URLs requested, so a test can assert what was asked of the server. */
function mockApi(customers: AdminCustomer[]) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('/api/admin/customers')) {
        return new Response(
          JSON.stringify({
            items: customers,
            page: 0,
            size: 25,
            totalItems: customers.length,
            totalPages: 1,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(null, { status: 204 });
    }),
  );
  return calls;
}

function customerUrls(calls: string[]) {
  return calls.filter((url) => url.includes('/api/admin/customers'));
}

describe('AdminCustomersPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists customers with what staff need to identify them', async () => {
    mockApi([makeAdminCustomer()]);
    renderWithRouter(<AdminCustomersPage />, {
      route: '/admin/customers',
      path: '/admin/customers',
    });

    expect(await screen.findByRole('link', { name: 'Test Customer' })).toBeInTheDocument();
    expect(screen.getByText('customer@test.local')).toBeInTheDocument();
    expect(screen.getByText('07700 900123')).toBeInTheDocument();
  });

  it('shows a customer who has never booked as zero, not blank', async () => {
    // The server has no row to group for them, so the count is absent rather than zero. Read
    // as "missing", this cell would be empty and look like data that failed to load.
    mockApi([makeAdminCustomer({ bookingCount: 0 })]);
    renderWithRouter(<AdminCustomersPage />, {
      route: '/admin/customers',
      path: '/admin/customers',
    });

    await screen.findByRole('link', { name: 'Test Customer' });
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('searches as you type, one request per word', async () => {
    const calls = mockApi([makeAdminCustomer()]);
    const user = userEvent.setup();
    renderWithRouter(<AdminCustomersPage />, {
      route: '/admin/customers',
      path: '/admin/customers',
    });

    await screen.findByRole('link', { name: 'Test Customer' });
    const before = customerUrls(calls).length;

    await user.type(screen.getByLabelText('Search'), 'smith');

    await waitFor(() => {
      expect(customerUrls(calls).at(-1)).toContain('search=smith');
    });
    // One request for the word, not one per letter.
    expect(customerUrls(calls).length - before).toBe(1);
  });

  it('sends a search term from the URL, so a shared link finds the same person', async () => {
    const calls = mockApi([makeAdminCustomer()]);
    renderWithRouter(<AdminCustomersPage />, {
      route: '/admin/customers?search=smith',
      path: '/admin/customers',
    });

    await screen.findByRole('link', { name: 'Test Customer' });
    expect(customerUrls(calls)[0]).toContain('search=smith');
  });

  it('says so plainly when nothing matches', async () => {
    mockApi([]);
    renderWithRouter(<AdminCustomersPage />, {
      route: '/admin/customers',
      path: '/admin/customers',
    });

    expect(await screen.findByText(/no customers match/i)).toBeInTheDocument();
  });
});

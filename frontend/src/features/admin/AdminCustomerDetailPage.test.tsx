import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeAdminBooking, makeAdminCustomer } from '@/test/factories';
import { renderWithRouter } from '@/test/renderWithProviders';
import { AdminCustomerDetailPage } from './AdminCustomerDetailPage';
import type { AdminBooking, AdminCustomer } from './types';

function mockApi(customer: AdminCustomer, bookings: AdminBooking[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/admin/customers/')) {
        return new Response(JSON.stringify({ customer, bookings }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(null, { status: 204 });
    }),
  );
}

/** An ISO date the given number of days from today, so "upcoming" stays upcoming. */
function isoDaysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

describe('AdminCustomerDetailPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('separates what they have booked from what they had', async () => {
    // The whole reason someone opens this record mid-call is "when are they next in". A single
    // merged list buries that answer among however many past visits they have had.
    mockApi(makeAdminCustomer(), [
      makeAdminBooking({ reference: 'SNK-FUTURE', date: isoDaysFromNow(5) }),
      makeAdminBooking({ reference: 'SNK-PAST', date: isoDaysFromNow(-5) }),
    ]);

    renderWithRouter(<AdminCustomerDetailPage />, {
      route: '/admin/customers/7',
      path: '/admin/customers/:id',
    });

    expect(await screen.findByText('Test Customer')).toBeInTheDocument();

    const upcoming = screen.getByRole('heading', { name: 'Upcoming' }).parentElement!;
    const past = screen.getByRole('heading', { name: 'Past' }).parentElement!;

    expect(upcoming).toHaveTextContent('Table 1');
    expect(upcoming).not.toHaveTextContent('No previous bookings');
    // The past booking must not appear under Upcoming, which is the failure that matters: it
    // would have staff telling a caller they are booked in when they are not.
    expect(past.querySelectorAll('li')).toHaveLength(1);
    expect(upcoming.querySelectorAll('li')).toHaveLength(1);
  });

  it('says plainly when a customer has nothing booked', async () => {
    mockApi(makeAdminCustomer({ bookingCount: 0 }), []);

    renderWithRouter(<AdminCustomerDetailPage />, {
      route: '/admin/customers/7',
      path: '/admin/customers/:id',
    });

    expect(await screen.findByText(/nothing booked at the moment/i)).toBeInTheDocument();
    expect(screen.getByText(/no previous bookings/i)).toBeInTheDocument();
  });

  it('flags money still owed on one of their bookings', async () => {
    // Same badge as the list. Staff looking at a customer record should see that this caller
    // owes for a booking without having to open it.
    mockApi(makeAdminCustomer(), [
      makeAdminBooking({
        reference: 'SNK-PHONE1',
        date: isoDaysFromNow(3),
        source: 'TELEPHONE',
        paymentStatus: 'REQUIRES_PAYMENT',
        amountOutstandingPence: 1200,
        payableAtCounter: true,
      }),
    ]);

    renderWithRouter(<AdminCustomerDetailPage />, {
      route: '/admin/customers/7',
      path: '/admin/customers/:id',
    });

    expect(await screen.findByText(/pay on arrival — £12\.00 due/i)).toBeInTheDocument();
  });

  it('reports a failure rather than rendering an empty record', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ message: 'Nope' }), { status: 500 })),
    );

    renderWithRouter(<AdminCustomerDetailPage />, {
      route: '/admin/customers/7',
      path: '/admin/customers/:id',
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load this customer/i);
  });
});

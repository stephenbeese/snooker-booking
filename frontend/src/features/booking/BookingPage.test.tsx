import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeBooking as aBooking } from '@/test/factories';
import { renderWithRouter } from '@/test/renderWithProviders';
import { BookingPage } from './BookingPage';
import type { Booking } from './types';

function mockBooking(booking: Booking) {
  vi.stubGlobal(
    'fetch',
    // The page captions the table with its type, whose labels come from /api/tables/types.
    // Answering that request with the booking hands an object to code expecting a list.
    vi.fn(async (input: RequestInfo | URL) => {
      const body = String(input).includes('/api/tables/types')
        ? [{ code: 'SNOOKER', label: 'Snooker' }]
        : booking;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
}

describe('BookingPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('confirms a paid booking', async () => {
    mockBooking(aBooking({ status: 'CONFIRMED' }));

    renderWithRouter(<BookingPage />, {
      route: '/bookings/SNK-ABC123',
      path: '/bookings/:reference',
    });

    expect(await screen.findByText('Booking confirmed')).toBeInTheDocument();
    expect(screen.getByText('£12.00')).toBeInTheDocument();
  });

  it('shows a confirming state, not a failure, immediately after returning from Stripe', async () => {
    // The webhook is often a second or two behind the browser redirect. Telling the customer
    // their payment failed here is the bug this test exists to prevent — they would pay twice.
    mockBooking(aBooking({ status: 'PENDING_PAYMENT', holdExpiresAt: '2026-08-20T18:15:00Z' }));

    renderWithRouter(<BookingPage />, {
      route: '/bookings/SNK-ABC123?payment=complete',
      path: '/bookings/:reference',
    });

    expect(await screen.findByText('Confirming your payment…')).toBeInTheDocument();
    expect(screen.getByText(/do not need to pay again/i)).toBeInTheDocument();
  });

  it('offers payment for an unpaid booking arrived at directly', async () => {
    mockBooking(aBooking({ status: 'PENDING_PAYMENT', holdExpiresAt: '2026-08-20T18:15:00Z' }));

    renderWithRouter(<BookingPage />, {
      route: '/bookings/SNK-ABC123',
      path: '/bookings/:reference',
    });

    expect(await screen.findByText('Payment needed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pay now/i })).toBeInTheDocument();
  });

  it('shows the booking as paid when Pay now finds it was already paid for', async () => {
    // The recovery path for a missed webhook. The server checks with Stripe, finds the money
    // was taken, confirms the booking and refuses the checkout with PAYMENT_NOT_REQUIRED.
    // That refusal is good news, so it must read as a confirmed booking rather than an error.
    let confirmed = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if ((init?.method ?? 'GET').toUpperCase() === 'POST' && url.includes('/checkout')) {
          // The server confirms the booking as a side effect of this refusal.
          confirmed = true;
          return new Response(
            JSON.stringify({
              code: 'PAYMENT_NOT_REQUIRED',
              message: 'This booking has already been paid for.',
            }),
            { status: 422, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify(
            aBooking({ status: confirmed ? 'CONFIRMED' : 'PENDING_PAYMENT' }),
          ),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );

    const user = userEvent.setup();
    renderWithRouter(<BookingPage />, {
      route: '/bookings/SNK-ABC123',
      path: '/bookings/:reference',
    });

    await user.click(await screen.findByRole('button', { name: /pay now/i }));

    expect(await screen.findByText('Booking confirmed')).toBeInTheDocument();
  });

  it('says so when the payment page could not be opened', async () => {
    // Refusing is right when the server cannot check the previous attempt with Stripe, but
    // refusing invisibly leaves a button that does nothing when clicked.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if ((init?.method ?? 'GET').toUpperCase() === 'POST' && url.includes('/checkout')) {
          return new Response(
            JSON.stringify({
              code: 'PAYMENT_PROVIDER_ERROR',
              message: 'We could not check your previous payment.',
            }),
            { status: 502, headers: { 'Content-Type': 'application/json' } },
          );
        }
        const body = url.includes('/api/tables/types')
          ? [{ code: 'SNOOKER', label: 'Snooker' }]
          : aBooking({ status: 'PENDING_PAYMENT' });
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );

    const user = userEvent.setup();
    renderWithRouter(<BookingPage />, {
      route: '/bookings/SNK-ABC123',
      path: '/bookings/:reference',
    });

    await user.click(await screen.findByRole('button', { name: /pay now/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'could not check your previous payment',
    );
  });

  it('explains an expired booking and offers to rebook', async () => {
    mockBooking(aBooking({ status: 'EXPIRED' }));

    renderWithRouter(<BookingPage />, {
      route: '/bookings/SNK-ABC123',
      path: '/bookings/:reference',
    });

    expect(await screen.findByText('This booking expired')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /book another slot/i })).toBeInTheDocument();
  });

  it('surfaces a load failure without a stack trace', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(
        JSON.stringify({ code: 'NOT_FOUND', message: 'No booking found with that reference.' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      )),
    );

    renderWithRouter(<BookingPage />, {
      route: '/bookings/SNK-NOPE',
      path: '/bookings/:reference',
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('No booking found with that reference.');
    });
  });
});

import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithRouter } from '@/test/renderWithProviders';
import { BookingPage } from './BookingPage';
import type { Booking } from './types';

function aBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    reference: 'SNK-ABC123',
    tableId: 1,
    tableName: 'Table 1',
    date: '2026-08-20',
    startTime: '19:00:00',
    endTime: '20:00:00',
    startAt: '2026-08-20T18:00:00Z',
    endAt: '2026-08-20T19:00:00Z',
    durationMinutes: 60,
    pricePence: 1200,
    status: 'CONFIRMED',
    holdExpiresAt: null,
    customerName: 'Test Customer',
    notes: null,
    ...overrides,
  };
}

function mockBooking(booking: Booking) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(booking), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })),
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

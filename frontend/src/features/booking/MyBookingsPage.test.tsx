import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeBooking } from '@/test/factories';
import { renderWithRouter } from '@/test/renderWithProviders';
import { MyBookingsPage } from './MyBookingsPage';
import type { Booking } from './types';

function mockBookings(bookings: Booking[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/cancel')) {
        const cancelled = { ...bookings[0], status: 'CANCELLED' as const, cancellable: false };
        return new Response(JSON.stringify(cancelled), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/bookings')) {
        return new Response(JSON.stringify(bookings), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      // The CSRF priming call and anything else.
      void init;
      return new Response(null, { status: 204 });
    }),
  );
}

/** Well ahead, so it lands in "Upcoming" whenever the suite runs. */
function futureBooking(overrides: Partial<Booking> = {}): Booking {
  const start = new Date(Date.now() + 7 * 24 * 3600_000);
  const end = new Date(start.getTime() + 3600_000);
  return makeBooking({
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    date: start.toISOString().slice(0, 10),
    ...overrides,
  });
}

function pastBooking(overrides: Partial<Booking> = {}): Booking {
  const start = new Date(Date.now() - 7 * 24 * 3600_000);
  const end = new Date(start.getTime() + 3600_000);
  return makeBooking({
    reference: 'SNK-PAST01',
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    date: start.toISOString().slice(0, 10),
    status: 'COMPLETED',
    cancellable: false,
    ...overrides,
  });
}

describe('MyBookingsPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('separates upcoming bookings from past ones', async () => {
    mockBookings([futureBooking(), pastBooking()]);
    renderWithRouter(<MyBookingsPage />);

    expect(await screen.findByText('Upcoming')).toBeInTheDocument();
    expect(screen.getByText('Past')).toBeInTheDocument();
    expect(screen.getByText('SNK-ABC123')).toBeInTheDocument();
    expect(screen.getByText('SNK-PAST01')).toBeInTheDocument();
  });

  it('offers cancellation when the server says it is allowed', async () => {
    mockBookings([futureBooking({ cancellable: true })]);
    renderWithRouter(<MyBookingsPage />);

    expect(await screen.findByRole('button', { name: /cancel booking/i })).toBeInTheDocument();
  });

  it("hides cancellation and explains why when the server refuses", async () => {
    // The decisive assertion for this page: the button follows the server's `cancellable`
    // flag, not a rule reimplemented on the client. A UI that computed the notice period
    // itself would offer a button the API then rejects.
    mockBookings([
      futureBooking({
        cancellable: false,
        cancellationBlockedReason:
          'Bookings must be cancelled at least 24 hours before the start time. Please call the club.',
      }),
    ]);
    renderWithRouter(<MyBookingsPage />);

    expect(await screen.findByText(/at least 24 hours/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancel booking/i })).not.toBeInTheDocument();
  });

  it('asks for confirmation before cancelling, and does not cancel if dismissed', async () => {
    const user = userEvent.setup();
    mockBookings([futureBooking()]);
    renderWithRouter(<MyBookingsPage />);

    await user.click(await screen.findByRole('button', { name: /cancel booking/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/cancel this booking\?/i)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /keep booking/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // Nothing was sent: only the GET that loaded the list.
    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.some(([url]) => String(url).includes('/cancel'))).toBe(false);
  });

  it('posts the cancellation once confirmed', async () => {
    const user = userEvent.setup();
    mockBookings([futureBooking()]);
    renderWithRouter(<MyBookingsPage />);

    await user.click(await screen.findByRole('button', { name: /cancel booking/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /yes, cancel it/i }));

    await waitFor(() => {
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.some(([url]) => String(url).includes('/cancel'))).toBe(true);
    });
  });

  it('invites a first booking when there are none', async () => {
    mockBookings([]);
    renderWithRouter(<MyBookingsPage />);

    expect(await screen.findByText(/no bookings yet/i)).toBeInTheDocument();
  });
});

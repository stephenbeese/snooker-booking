import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeAdminBooking } from '@/test/factories';
import { renderWithRouter } from '@/test/renderWithProviders';
import { AdminBookingDetailPage } from './AdminBookingDetailPage';
import type { AdminBooking } from './types';

function mockApi(booking: AdminBooking) {
  const calls: { url: string; method: string; body: string | null }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({
        url,
        method: (init?.method ?? 'GET').toUpperCase(),
        body: typeof init?.body === 'string' ? init.body : null,
      });

      if (url.includes('/cancel')) {
        return json({ ...booking, status: 'CANCELLED', cancellable: false });
      }
      if (url.includes('/api/admin/bookings/')) {
        return json(booking);
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

function renderDetail() {
  return renderWithRouter(<AdminBookingDetailPage />, {
    route: '/admin/bookings/SNK-ABC123',
    path: '/admin/bookings/:reference',
  });
}

describe('AdminBookingDetailPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the customer contact details', async () => {
    mockApi(makeAdminBooking());
    renderDetail();

    expect(await screen.findByText('customer@test.local')).toBeInTheDocument();
    expect(screen.getByText('07700 900123')).toBeInTheDocument();
  });

  it('offers cancellation when the server allows it', async () => {
    mockApi(makeAdminBooking({ cancellable: true }));
    renderDetail();

    expect(await screen.findByRole('button', { name: /^cancel booking$/i })).toBeInTheDocument();
  });

  it('hides cancellation when the server refuses, and explains why', async () => {
    // The decisive assertion: staff bypass the notice period, but that is the server's
    // decision. A client that reimplemented "admins can always cancel" would offer a button
    // for a booking that has already started, which the API rejects.
    mockApi(
      makeAdminBooking({
        cancellable: false,
        cancellationBlockedReason: 'This booking has already started.',
      }),
    );
    renderDetail();

    expect(await screen.findByText(/already started/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^cancel booking$/i })).not.toBeInTheDocument();
  });

  it('requires a confirmation step and sends the reason', async () => {
    const calls = mockApi(makeAdminBooking());
    const user = userEvent.setup();
    renderDetail();

    await user.click(await screen.findByRole('button', { name: /^cancel booking$/i }));

    // Nothing sent yet: revealing the form must not be the same act as cancelling.
    expect(calls.some((call) => call.url.includes('/cancel'))).toBe(false);

    await user.type(screen.getByLabelText(/reason/i), 'Customer rang the club');
    await user.click(screen.getByRole('button', { name: /confirm cancellation/i }));

    await waitFor(() => {
      const cancelCall = calls.find((call) => call.url.includes('/cancel'));
      expect(cancelCall).toBeDefined();
      expect(cancelCall?.method).toBe('POST');
      expect(cancelCall?.body).toContain('Customer rang the club');
    });
  });

  it('does not cancel if the confirmation is dismissed', async () => {
    const calls = mockApi(makeAdminBooking());
    const user = userEvent.setup();
    renderDetail();

    await user.click(await screen.findByRole('button', { name: /^cancel booking$/i }));
    await user.click(screen.getByRole('button', { name: /keep booking/i }));

    expect(calls.some((call) => call.url.includes('/cancel'))).toBe(false);
  });
});

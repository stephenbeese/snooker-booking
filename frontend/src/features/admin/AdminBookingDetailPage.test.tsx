import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeAdminBooking } from '@/test/factories';
import { renderWithRouter } from '@/test/renderWithProviders';
import { AdminBookingDetailPage } from './AdminBookingDetailPage';
import type { AdminBooking } from './types';

/**
 * Stands in for the server, including its memory.
 *
 * <p>A settled booking stays settled on the next GET. That matters because the mutation both
 * writes the result into the cache *and* invalidates the list, which refetches this booking — a
 * mock that always replayed the original row would overwrite the settled one and make a passing
 * implementation look broken.
 */
function mockApi(booking: AdminBooking, options: { paymentFails?: string } = {}) {
  const calls: { url: string; method: string; body: string | null }[] = [];
  let current = booking;

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = typeof init?.body === 'string' ? init.body : null;
      calls.push({ url, method: (init?.method ?? 'GET').toUpperCase(), body });

      if (url.includes('/cancel')) {
        current = { ...current, status: 'CANCELLED', cancellable: false };
        return json(current);
      }
      if (url.includes('/payment')) {
        if (options.paymentFails) {
          return json({ code: 'PAYMENT_NOT_REQUIRED', message: options.paymentFails }, 422);
        }
        current = {
          ...current,
          paymentStatus: JSON.parse(body ?? '{}').status,
          amountOutstandingPence: 0,
          payableAtCounter: false,
        };
        return json(current);
      }
      if (url.includes('/api/admin/bookings/')) {
        return json(current);
      }
      return new Response(null, { status: 204 });
    }),
  );
  return calls;
}

/** A telephone booking with money still to collect. */
function unpaidAtCounter(overrides: Partial<AdminBooking> = {}) {
  return makeAdminBooking({
    source: 'TELEPHONE',
    paymentStatus: 'REQUIRES_PAYMENT',
    amountOutstandingPence: 1200,
    payableAtCounter: true,
    ...overrides,
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
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

  describe('counter payment', () => {
    it('shows what is owed, and records it as paid', async () => {
      const calls = mockApi(unpaidAtCounter());
      const user = userEvent.setup();
      renderDetail();

      // The amount has to be on screen: staff are about to key it into a card machine.
      expect(await screen.findByText(/£12\.00 to collect/i)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /mark as paid/i }));

      await waitFor(() => {
        const call = calls.find((c) => c.url.includes('/payment'));
        expect(call?.method).toBe('POST');
        expect(JSON.parse(call?.body ?? '{}').status).toBe('PAID_AT_COUNTER');
      });
    });

    it('clears the prompt once payment is recorded', async () => {
      mockApi(unpaidAtCounter());
      const user = userEvent.setup();
      renderDetail();

      await user.click(await screen.findByRole('button', { name: /mark as paid/i }));

      // The decisive assertion. If the settled booking did not replace the cached one, staff
      // would still see "to collect" for a customer who has just paid, and ask again.
      await waitFor(() => {
        expect(screen.queryByText(/to collect/i)).not.toBeInTheDocument();
      });
      // Both the badge and the details row say so, which is the intent — staff see it wherever
      // they happen to be looking.
      expect(screen.getAllByText(/paid at the counter/i).length).toBeGreaterThan(0);
    });

    it('confirms the amount taken, reading it before the panel disappears', async () => {
      // The panel unmounts on success, because the server stops reporting anything payable —
      // so amountOutstandingPence is 0 by the time the confirmation is built. Reading it after
      // the mutation would announce "£0.00 recorded as paid", which is worse than silence on
      // a screen staff use to reconcile a till.
      mockApi(unpaidAtCounter());
      const user = userEvent.setup();
      renderDetail();

      await user.click(await screen.findByRole('button', { name: /mark as paid/i }));

      expect(await screen.findByRole('status')).toHaveTextContent('£12.00 recorded as paid');
    });

    it('says the money was waived rather than collected', async () => {
      // The two outcomes settle the same booking but mean opposite things to the till. One
      // message for both would make a comped session indistinguishable from a paid one.
      mockApi(unpaidAtCounter());
      const user = userEvent.setup();
      renderDetail();

      await user.click(await screen.findByRole('button', { name: /waive payment/i }));
      await user.click(screen.getByRole('button', { name: /confirm waiver/i }));

      const status = await screen.findByRole('status');
      expect(status).toHaveTextContent('£12.00 waived');
      expect(status).not.toHaveTextContent(/recorded as paid/);
    });

    it('takes a second click to waive a payment', async () => {
      const calls = mockApi(unpaidAtCounter());
      const user = userEvent.setup();
      renderDetail();

      await user.click(await screen.findByRole('button', { name: /waive payment/i }));

      // Revealing the confirmation must not itself comp the session — there is no receipt to
      // reconcile a waiver against afterwards.
      expect(calls.some((call) => call.url.includes('/payment'))).toBe(false);

      await user.click(screen.getByRole('button', { name: /confirm waiver/i }));

      await waitFor(() => {
        const call = calls.find((c) => c.url.includes('/payment'));
        expect(JSON.parse(call?.body ?? '{}').status).toBe('WAIVED');
      });
    });

    it('offers nothing to collect on a booking already paid online', async () => {
      // makeAdminBooking defaults to a paid ONLINE booking. Offering "mark as paid" here would
      // let staff record cash for money Stripe already took.
      mockApi(makeAdminBooking());
      renderDetail();

      expect(await screen.findByText('customer@test.local')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /mark as paid/i })).not.toBeInTheDocument();
      expect(screen.queryByText(/to collect/i)).not.toBeInTheDocument();
    });

    it('shows the server’s reason when a payment is refused', async () => {
      // "Already paid" is a rule the client deliberately does not duplicate, so the server's
      // message is the only thing that can explain the refusal.
      mockApi(unpaidAtCounter(), { paymentFails: 'This booking has already been paid for.' });
      const user = userEvent.setup();
      renderDetail();

      await user.click(await screen.findByRole('button', { name: /mark as paid/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/already been paid/i);
    });
  });
});

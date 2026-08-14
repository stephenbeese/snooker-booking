import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithRouter } from '@/test/renderWithProviders';
import { AdminPaymentsPage } from './AdminPaymentsPage';
import type { PaymentDecision } from './types';

function aDecision(overrides: Partial<PaymentDecision> = {}): PaymentDecision {
  return {
    id: 1,
    reference: 'SNK-ABC123',
    tableName: 'Table 1',
    date: '2026-08-20',
    startTime: '19:00:00',
    endTime: '20:00:00',
    customerName: 'Jo Bloggs',
    customerEmail: 'jo@test.local',
    customerPhone: '07700 900999',
    amountPence: 1200,
    paymentStatus: 'SUCCEEDED',
    refundable: true,
    reason: 'Booking cancelled after payment was taken. Refund decision required.',
    raisedAt: '2026-08-14T10:00:00Z',
    ...overrides,
  };
}

/** Answers the queue with the given rows, and records every POST for asserting on. */
function mockApi(decisions: PaymentDecision[]) {
  const posts: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if ((init?.method ?? 'GET').toUpperCase() === 'POST') {
        posts.push(url);
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify(decisions), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
  return posts;
}

describe('AdminPaymentsPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('names the booking and customer behind each decision', async () => {
    // The dashboard counted these and named none of them, which is the gap this page fills.
    mockApi([aDecision()]);
    renderWithRouter(<AdminPaymentsPage />, { route: '/admin/payments', path: '/admin/payments' });

    expect(await screen.findByText('SNK-ABC123')).toBeInTheDocument();
    expect(screen.getByText(/Jo Bloggs/)).toBeInTheDocument();
    expect(screen.getByText('£12.00')).toBeInTheDocument();
    expect(screen.getByText(/jo@test.local/)).toBeInTheDocument();
  });

  it('takes two clicks to refund, because it moves real money', async () => {
    const posts = mockApi([aDecision()]);
    renderWithRouter(<AdminPaymentsPage />, { route: '/admin/payments', path: '/admin/payments' });

    await userEvent.click(await screen.findByRole('button', { name: 'Refund in full' }));
    // Nothing has happened yet: the first click only asks.
    expect(posts).toEqual([]);

    await userEvent.click(screen.getByRole('button', { name: /Confirm £12\.00 refund/ }));

    await waitFor(() =>
      expect(posts).toContain('/api/admin/payments/decisions/1/refund'),
    );
  });

  it('offers no refund button for money that was not taken by card', async () => {
    // Counter cash reaches this queue too, and there is no payment intent to send back. A
    // refund button here would fail at the server every time it was pressed.
    mockApi([aDecision({ refundable: false, paymentStatus: 'PAID_AT_COUNTER' })]);
    renderWithRouter(<AdminPaymentsPage />, { route: '/admin/payments', path: '/admin/payments' });

    expect(await screen.findByRole('button', { name: 'Mark as settled' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refund in full' })).not.toBeInTheDocument();
    expect(screen.getByText(/cannot be refunded here/)).toBeInTheDocument();
  });

  it('says so when there is nothing to decide', async () => {
    mockApi([]);
    renderWithRouter(<AdminPaymentsPage />, { route: '/admin/payments', path: '/admin/payments' });

    expect(await screen.findByText('Nothing to decide')).toBeInTheDocument();
  });
});

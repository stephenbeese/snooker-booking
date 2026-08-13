import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeAdminBooking } from '@/test/factories';
import { renderWithRouter } from '@/test/renderWithProviders';
import { AdminTelephoneBookingPage } from './AdminTelephoneBookingPage';

const TABLES = [
  { id: 1, name: 'Table 1', tableType: 'SNOOKER', displayOrder: 1, active: true, notes: null },
  { id: 2, name: 'Retired', tableType: 'SNOOKER', displayOrder: 2, active: false, notes: null },
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** @param onBooking what POST /telephone should answer with. */
function mockApi(onBooking: () => Response) {
  const calls: { url: string; method: string; body: string | null }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      calls.push({ url, method, body: typeof init?.body === 'string' ? init.body : null });

      if (url.includes('/api/admin/tables')) return json(TABLES);
      if (url.includes('/api/admin/bookings/telephone')) return onBooking();
      return new Response(null, { status: 204 });
    }),
  );
  return calls;
}

async function selectTable(user: ReturnType<typeof userEvent.setup>) {
  // Wait for the option, not merely the select: the select renders immediately and is empty
  // until the tables query resolves, so selecting too early fails on a missing value.
  await screen.findByRole('option', { name: 'Table 1' });
  await user.selectOptions(screen.getByLabelText('Table'), '1');
}

async function fillTheForm(user: ReturnType<typeof userEvent.setup>) {
  await selectTable(user);
  await user.clear(screen.getByLabelText('Date'));
  await user.type(screen.getByLabelText('Date'), '2030-06-01');
  await user.clear(screen.getByLabelText('Start time'));
  await user.type(screen.getByLabelText('Start time'), '19:00');
  await user.type(screen.getByLabelText('Email address'), 'caller@example.test');
  await user.type(screen.getByLabelText('First name'), 'Phone');
  await user.type(screen.getByLabelText('Last name'), 'Caller');
}

describe('AdminTelephoneBookingPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('offers only tables that are on sale', async () => {
    mockApi(() => json({}));
    renderWithRouter(<AdminTelephoneBookingPage />, {
      route: '/admin/bookings/telephone',
      path: '/admin/bookings/telephone',
    });

    // An inactive table cannot be booked by anyone, so offering it would only produce a
    // server-side rejection after staff have typed everything else in.
    expect(await screen.findByRole('option', { name: 'Table 1' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Retired' })).not.toBeInTheDocument();
  });

  it('sends the booking and confirms it with a reference', async () => {
    const booking = makeAdminBooking({
      reference: 'SNK-PHONE1',
      status: 'CONFIRMED',
      source: 'TELEPHONE',
    });
    const calls = mockApi(() => json(booking, 201));
    const user = userEvent.setup();
    renderWithRouter(<AdminTelephoneBookingPage />, {
      route: '/admin/bookings/telephone',
      path: '/admin/bookings/telephone',
    });

    await fillTheForm(user);
    await user.click(screen.getByRole('button', { name: 'Take booking' }));

    // The reference is what staff read back down the phone, so it has to be on screen.
    expect(await screen.findByText(/SNK-PHONE1/)).toBeInTheDocument();

    const post = calls.find((call) => call.method === 'POST');
    expect(post?.url).toContain('/api/admin/bookings/telephone');
    const sent = JSON.parse(post?.body ?? '{}');
    expect(sent.customerEmail).toBe('caller@example.test');
    expect(sent.tableId).toBe(1);
    // No price is ever sent: the server prices the booking from the club's own rules.
    expect(sent).not.toHaveProperty('pricePence');
  });

  it("shows the server's refusal rather than a generic message", async () => {
    // The distinction matters: "that slot has gone" and "the table is being re-clothed" call
    // for different things to say to the person on the phone.
    mockApi(() =>
      json({ code: 'SLOT_UNAVAILABLE', message: 'That time has just been taken.' }, 422),
    );
    const user = userEvent.setup();
    renderWithRouter(<AdminTelephoneBookingPage />, {
      route: '/admin/bookings/telephone',
      path: '/admin/bookings/telephone',
    });

    await fillTheForm(user);
    await user.click(screen.getByRole('button', { name: 'Take booking' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('That time has just been taken.');
  });

  it('refuses to submit a malformed email', async () => {
    const calls = mockApi(() => json({}, 201));
    const user = userEvent.setup();
    renderWithRouter(<AdminTelephoneBookingPage />, {
      route: '/admin/bookings/telephone',
      path: '/admin/bookings/telephone',
    });

    await selectTable(user);
    await user.type(screen.getByLabelText('Email address'), 'not-an-email');
    await user.type(screen.getByLabelText('First name'), 'Phone');
    await user.type(screen.getByLabelText('Last name'), 'Caller');
    await user.click(screen.getByRole('button', { name: 'Take booking' }));

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    await waitFor(() => {
      expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0);
    });
  });
});

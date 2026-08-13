import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeAdminBooking, makeAvailability, makeSlot, makeTable } from '@/test/factories';
import { renderWithRouter } from '@/test/renderWithProviders';
import { AdminTelephoneBookingPage } from './AdminTelephoneBookingPage';

const TABLES = [
  { id: 1, name: 'Table 1', tableType: 'SNOOKER', displayOrder: 1, active: true, notes: null },
  { id: 2, name: 'Retired', tableType: 'SNOOKER', displayOrder: 2, active: false, notes: null },
];

/**
 * Two rows, so the table filter has something to remove and slot selection has to identify
 * which row was clicked rather than assuming the first.
 */
const GRID = makeAvailability({
  tables: [
    makeTable({ tableId: 1, tableName: 'Table 1' }),
    makeTable({ tableId: 3, tableName: 'Match Table' }),
  ],
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** @param onBooking what POST /telephone should answer with. */
function mockApi(onBooking: () => Response, availability: unknown = GRID) {
  const calls: { url: string; method: string; body: string | null }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      calls.push({ url, method, body: typeof init?.body === 'string' ? init.body : null });

      if (url.includes('/api/admin/tables')) return json(TABLES);
      if (url.includes('/api/admin/bookings/telephone')) return onBooking();
      if (url.includes('/api/admin/availability')) return json(availability);
      return new Response(null, { status: 204 });
    }),
  );
  return calls;
}

async function selectTable(user: ReturnType<typeof userEvent.setup>) {
  // Scoped to the booking select. "Table 1" is also an option in the grid's "Show" filter,
  // so an unscoped query matches two elements and throws.
  //
  // Waiting on the option rather than the select: the select renders immediately and is
  // empty until the tables query resolves, so selecting too early fails on a missing value.
  const select = screen.getByLabelText('Table');
  await waitFor(() => {
    expect(within(select).getByRole('option', { name: 'Table 1' })).toBeInTheDocument();
  });
  await user.selectOptions(select, '1');
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
    const select = screen.getByLabelText('Table');
    await waitFor(() => {
      expect(within(select).getByRole('option', { name: 'Table 1' })).toBeInTheDocument();
    });
    expect(within(select).queryByRole('option', { name: 'Retired' })).not.toBeInTheDocument();
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

  it('asks the staff availability endpoint, not the customer one', async () => {
    // The two answer differently for the same date: the staff grid is built under
    // BookingPolicy.staff(), so notice and advance limits are lifted. Reading the public
    // endpoint here would grey out slots the telephone booking endpoint accepts.
    const calls = mockApi(() => json({}));
    renderWithRouter(<AdminTelephoneBookingPage />, {
      route: '/admin/bookings/telephone',
      path: '/admin/bookings/telephone',
    });

    await waitFor(() => {
      expect(calls.some((call) => call.url.includes('/api/admin/availability'))).toBe(true);
    });
    expect(calls.some((call) => /\/api\/availability\?/.test(call.url))).toBe(false);
  });

  it('books the table and time of the cell that was clicked', async () => {
    // The whole point of the grid. Clicking a cell on the second row must book that row's
    // table — reading the first row, or leaving the table select untouched, would take a
    // booking for a table nobody chose.
    const booking = makeAdminBooking({ reference: 'SNK-GRID1' });
    const calls = mockApi(() => json(booking, 201));
    const user = userEvent.setup();
    renderWithRouter(<AdminTelephoneBookingPage />, {
      route: '/admin/bookings/telephone',
      path: '/admin/bookings/telephone',
    });

    const cells = await screen.findAllByRole('button', { name: /10:30 — available/ });
    // Second row: Match Table, id 3.
    await user.click(cells[1]!);

    await user.type(screen.getByLabelText('Email address'), 'caller@example.test');
    await user.type(screen.getByLabelText('First name'), 'Phone');
    await user.type(screen.getByLabelText('Last name'), 'Caller');
    await user.click(screen.getByRole('button', { name: 'Take booking' }));

    await screen.findByText(/SNK-GRID1/);
    const sent = JSON.parse(calls.find((call) => call.method === 'POST')?.body ?? '{}');
    expect(sent.tableId).toBe(3);
    expect(sent.startTime).toBe('10:30');
  });

  it('lets staff overwrite the grid’s time with one the grid does not offer', async () => {
    // The backend lifts notice and advance for staff, and has always let them key an
    // arbitrary time. The grid is an affordance; if picking a cell locked the field, the
    // picker would have removed a freedom staff still have.
    const booking = makeAdminBooking({ reference: 'SNK-OFFGRID' });
    const calls = mockApi(() => json(booking, 201));
    const user = userEvent.setup();
    renderWithRouter(<AdminTelephoneBookingPage />, {
      route: '/admin/bookings/telephone',
      path: '/admin/bookings/telephone',
    });

    const cell = (await screen.findAllByRole('button', { name: /10:00 — available/ }))[0]!;
    await user.click(cell);

    const time = screen.getByLabelText('Start time');
    expect(time).toBeEnabled();
    await user.clear(time);
    await user.type(time, '10:17');

    await user.type(screen.getByLabelText('Email address'), 'caller@example.test');
    await user.type(screen.getByLabelText('First name'), 'Phone');
    await user.type(screen.getByLabelText('Last name'), 'Caller');
    await user.click(screen.getByRole('button', { name: 'Take booking' }));

    await screen.findByText(/SNK-OFFGRID/);
    const sent = JSON.parse(calls.find((call) => call.method === 'POST')?.body ?? '{}');
    expect(sent.startTime).toBe('10:17');
  });

  it('narrows the grid to one table without changing what gets booked', async () => {
    // The filter is a view control. Sending it as the booked table would book whatever
    // staff were merely looking at.
    const calls = mockApi(() => json({}));
    const user = userEvent.setup();
    renderWithRouter(<AdminTelephoneBookingPage />, {
      route: '/admin/bookings/telephone',
      path: '/admin/bookings/telephone',
    });

    await screen.findByRole('rowheader', { name: /Match Table/ });
    await user.selectOptions(screen.getByLabelText('Show'), '1');

    await waitFor(() => {
      expect(calls.some((call) => call.url.includes('tableId=1'))).toBe(true);
    });
    // Choosing what to look at must not choose what to book.
    expect((screen.getByLabelText('Table') as HTMLSelectElement).value).toBe('');
  });

  it('offers the durations the server allows rather than a hardcoded list', async () => {
    // A list baked into the page drifts the moment someone edits the club's min, max or
    // increment settings, and then offers a length the API rejects.
    mockApi(
      () => json({}),
      makeAvailability({
        durationOptions: [
          { minutes: 45, label: '45 mins' },
          { minutes: 135, label: '2 hours 15 mins' },
        ],
        tables: [makeTable({ slots: [makeSlot({ startTime: '10:00:00' })] })],
        slotTimes: ['10:00:00'],
      }),
    );
    renderWithRouter(<AdminTelephoneBookingPage />, {
      route: '/admin/bookings/telephone',
      path: '/admin/bookings/telephone',
    });

    expect(await screen.findByRole('option', { name: '2 hours 15 mins' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '180 minutes' })).not.toBeInTheDocument();
  });
});

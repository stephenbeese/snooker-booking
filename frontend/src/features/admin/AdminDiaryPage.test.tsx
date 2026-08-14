import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeAdminBooking, makeAvailability, makeSlot, makeTable } from '@/test/factories';
import { renderWithRouter } from '@/test/renderWithProviders';
import { AdminDiaryPage } from './AdminDiaryPage';
import type { AdminBooking } from './types';
import type { DayAvailability } from '@/features/availability/types';

/** What GET /api/tables/types answers. Server data since Phase 7, not a hardcoded union. */
const TABLE_TYPES = [
  { code: 'SNOOKER', label: 'Snooker' },
  { code: 'ENGLISH_POOL', label: 'English pool' },
];

function mockApi(availability: DayAvailability, bookings: AdminBooking[]) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      // Types before availability: the filter's options come from /api/tables/types, and
      // without its own branch it would fall through and be handed the availability object,
      // where the component's .map on it throws and the whole page fails to render.
      const body = url.includes('/api/tables/types')
        ? TABLE_TYPES
        : url.includes('/api/admin/bookings/day')
          ? bookings
          : availability;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
  return calls;
}

/** A day open 10:00–12:00 in 30-minute slots, every slot free. */
function openDay(overrides: Partial<DayAvailability> = {}) {
  const times = ['10:00:00', '10:30:00', '11:00:00', '11:30:00'];
  return makeAvailability({
    openingTime: '10:00:00',
    closingTime: '12:00:00',
    incrementMinutes: 30,
    slotTimes: times,
    tables: [makeTable({ slots: times.map((startTime) => makeSlot({ startTime })) })],
    ...overrides,
  });
}

describe('AdminDiaryPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lays the day out with a column per slot the club is open', async () => {
    mockApi(openDay(), []);
    renderWithRouter(<AdminDiaryPage />, { route: '/admin/diary', path: '/admin/diary' });

    expect(await screen.findByRole('columnheader', { name: '10:00' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '11:30' })).toBeInTheDocument();
    // 12:00 is closing time, which ends the last slot rather than starting one.
    expect(screen.queryByRole('columnheader', { name: '12:00' })).not.toBeInTheDocument();
  });

  it('shows a booking as one block across the slots it occupies', async () => {
    mockApi(openDay(), [
      makeAdminBooking({
        reference: 'SNK-DIARY1',
        customerName: 'Jo Bloggs',
        startTime: '10:30:00',
        durationMinutes: 60,
      }),
    ]);
    renderWithRouter(<AdminDiaryPage />, { route: '/admin/diary', path: '/admin/diary' });

    const block = await screen.findByRole('link', { name: /Jo Bloggs/ });
    expect(block.closest('td')).toHaveAttribute('colspan', '2');
    expect(block).toHaveAttribute('href', '/admin/bookings/SNK-DIARY1');
  });

  it('leaves the slot of a cancelled booking free to sell', async () => {
    // The day endpoint returns every status because the dashboard counts need them. A
    // cancelled booking drawn as a block would show a table as busy when it is free, and
    // staff would turn away a booking they could take.
    mockApi(openDay(), [
      makeAdminBooking({
        reference: 'SNK-GONE',
        customerName: 'Cancelled Customer',
        status: 'CANCELLED',
        startTime: '10:00:00',
      }),
    ]);
    renderWithRouter(<AdminDiaryPage />, { route: '/admin/diary', path: '/admin/diary' });

    await screen.findByRole('columnheader', { name: '10:00' });
    expect(screen.queryByText('Cancelled Customer')).not.toBeInTheDocument();
  });

  it('keeps the morning when the day is today', async () => {
    // Availability drops elapsed slots for today, so its own axis would start at the current
    // time and leave this morning's booking with no column to sit in.
    const afternoonOnly = openDay({
      slotTimes: ['11:00:00', '11:30:00'],
      tables: [
        makeTable({
          slots: [makeSlot({ startTime: '11:00:00' }), makeSlot({ startTime: '11:30:00' })],
        }),
      ],
    });
    mockApi(afternoonOnly, [
      makeAdminBooking({ customerName: 'Early Bird', startTime: '10:00:00', durationMinutes: 30 }),
    ]);
    renderWithRouter(<AdminDiaryPage />, { route: '/admin/diary', path: '/admin/diary' });

    expect(await screen.findByRole('columnheader', { name: '10:00' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Early Bird/ })).toBeInTheDocument();
  });

  it('filters to one table without losing the time axis', async () => {
    const twoTables = openDay({
      tables: [
        makeTable({ tableId: 1, tableName: 'Table 1' }),
        makeTable({ tableId: 2, tableName: 'Table 2', tableType: 'ENGLISH_POOL' }),
      ],
    });
    mockApi(twoTables, []);
    const user = userEvent.setup();
    renderWithRouter(<AdminDiaryPage />, { route: '/admin/diary', path: '/admin/diary' });

    expect(await screen.findByRole('rowheader', { name: /Table 2/ })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Table type'), 'ENGLISH_POOL');

    await waitFor(() =>
      expect(screen.queryByRole('rowheader', { name: /Table 1/ })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('rowheader', { name: /Table 2/ })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '10:00' })).toBeInTheDocument();
  });

  it('moves a day at a time and back to today', async () => {
    const calls = mockApi(openDay(), []);
    const user = userEvent.setup();
    renderWithRouter(<AdminDiaryPage />, {
      route: '/admin/diary?date=2026-08-20',
      path: '/admin/diary',
    });

    await screen.findByRole('columnheader', { name: '10:00' });

    await user.click(screen.getByRole('button', { name: /Next/ }));
    await waitFor(() => expect(calls.at(-1)).toContain('2026-08-21'));

    await user.click(screen.getByRole('button', { name: /Previous/ }));
    await waitFor(() => expect(calls.at(-1)).toContain('2026-08-20'));
  });

  it('says the club is shut rather than drawing an empty grid', async () => {
    mockApi(makeAvailability({ clubOpen: false, tables: [] }), []);
    renderWithRouter(<AdminDiaryPage />, { route: '/admin/diary', path: '/admin/diary' });

    expect(await screen.findByText(/club is closed/i)).toBeInTheDocument();
  });

  it('reports a failure rather than an empty day', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ message: 'Nope' }), { status: 500 })),
    );
    renderWithRouter(<AdminDiaryPage />, { route: '/admin/diary', path: '/admin/diary' });

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load the diary/i);
  });

  it('flags money owed on a block, so it is visible without opening the booking', async () => {
    mockApi(openDay(), [
      makeAdminBooking({
        customerName: 'Phone Caller',
        startTime: '10:00:00',
        source: 'TELEPHONE',
        paymentStatus: 'REQUIRES_PAYMENT',
        amountOutstandingPence: 1200,
        payableAtCounter: true,
      }),
    ]);
    renderWithRouter(<AdminDiaryPage />, { route: '/admin/diary', path: '/admin/diary' });

    const block = await screen.findByRole('link', { name: /Phone Caller/ });
    expect(within(block).getByText(/£12\.00 due/)).toBeInTheDocument();
  });
});

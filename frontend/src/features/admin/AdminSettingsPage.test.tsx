import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithRouter } from '@/test/renderWithProviders';
import { AdminSettingsPage } from './AdminSettingsPage';

const WEEK = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
].map((day) => ({ day, closed: false, openTime: '10:00:00', closeTime: '23:00:00' }));

/** One special date, so the section has something to list. */
const OVERRIDES = [
  {
    date: '2026-12-25',
    closed: true,
    openTime: null,
    closeTime: null,
    note: 'Christmas Day',
  },
];

const TABLE_TYPES = [
  { code: 'SNOOKER', label: 'Snooker', displayOrder: 0, active: true },
  { code: 'ENGLISH_POOL', label: 'English pool', displayOrder: 1, active: true },
];

const RULES = {
  minDurationMinutes: 30,
  maxDurationMinutes: 240,
  incrementMinutes: 30,
  minNoticeMinutes: 60,
  maxAdvanceDays: 30,
  cancellationNoticeHours: 24,
  paymentHoldMinutes: 15,
};

const CLUB = {
  name: 'The Snooker Club',
  addressLine1: '1 High Street',
  addressLine2: null,
  city: 'Manchester',
  postcode: 'M1 1AA',
  phone: '0161 000 0000',
  email: 'bookings@snookerclub.example',
  website: null,
  description: 'Championship tables.',
};

const PRICING = [
  {
    id: 1,
    name: 'Standard hourly rate',
    tableType: null,
    dayOfWeek: null,
    startTime: null,
    endTime: null,
    hourlyRatePence: 1200,
    priority: 0,
    active: true,
    catchAll: true,
  },
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** @param onHoursPut what PUT /opening-hours answers with. */
function mockApi(onHoursPut: () => Response = () => json({ settings: WEEK, warnings: [] })) {
  const calls: { url: string; method: string; body: string | null }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      calls.push({ url, method, body: typeof init?.body === 'string' ? init.body : null });

      // Narrowest first, exactly as SecurityConfig orders its matchers. '/opening-hours'
      // is a prefix of '/opening-hours/overrides', so checking the shorter one first would
      // hand the overrides list the seven-day week — and the section then renders a date
      // that is not there.
      if (url.includes('/opening-hours/overrides')) {
        return method === 'GET' ? json(OVERRIDES) : json({ settings: OVERRIDES, warnings: [] });
      }
      if (url.includes('/opening-hours')) {
        return method === 'GET' ? json(WEEK) : onHoursPut();
      }
      if (url.includes('/table-types')) return json(TABLE_TYPES);
      if (url.includes('/booking-rules')) {
        return method === 'GET' ? json(RULES) : json({ settings: RULES, warnings: [] });
      }
      if (url.includes('/pricing-rules')) return json(PRICING);
      if (url.includes('/settings/club')) {
        return method === 'GET' ? json(CLUB) : json({ settings: CLUB, warnings: [] });
      }
      return new Response(null, { status: 204 });
    }),
  );
  return calls;
}

function render() {
  return renderWithRouter(<AdminSettingsPage />, {
    route: '/admin/settings',
    path: '/admin/settings',
  });
}

describe('AdminSettingsPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the whole week when opening hours are saved', async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    render();

    // Close Monday.
    const mondayClosed = await screen.findByLabelText('Monday opening time');
    expect(mondayClosed).toBeInTheDocument();
    // By accessible name, not by index: seven identical "on" checkboxes would let this pass
    // while a screen-reader user could not tell the days apart.
    await user.click(screen.getByRole('checkbox', { name: 'Monday closed' }));
    await user.click(screen.getAllByRole('button', { name: 'Save' })[0]!);

    const put = await waitFor(() => {
      const found = calls.find((call) => call.method === 'PUT' && call.url.includes('/opening-hours'));
      expect(found).toBeDefined();
      return found!;
    });

    // All seven days, not just the changed one: the server rejects a partial week, and a
    // half-applied schedule is worse than none.
    const sent = JSON.parse(put.body ?? '{}');
    expect(sent.days).toHaveLength(7);
    expect(sent.days[0]).toMatchObject({ day: 'MONDAY', closed: true });
  });

  it('shows which bookings a settings change has stranded', async () => {
    // The whole reason the warnings array exists: staff must not close a day with games on
    // it and find out when the customers arrive.
    mockApi(() =>
      json({
        settings: WEEK,
        warnings: [
          { reference: 'SNK-ABC123', detail: 'The club would be closed on 2026-09-07.' },
        ],
      }),
    );
    const user = userEvent.setup();
    render();

    await screen.findByLabelText('Monday opening time');
    await user.click(screen.getByRole('checkbox', { name: 'Monday closed' }));
    await user.click(screen.getAllByRole('button', { name: 'Save' })[0]!);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('SNK-ABC123');
    // It must be clear the booking still stands — this is a warning, not a cancellation.
    expect(alert).toHaveTextContent(/unchanged and still stand/i);
  });

  it("surfaces the server's refusal when the rules are inconsistent", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = (init?.method ?? 'GET').toUpperCase();
        if (url.includes('/booking-rules') && method === 'PUT') {
          return json(
            {
              code: 'VALIDATION_FAILED',
              message: 'Both durations must be a multiple of the 30-minute increment.',
            },
            422,
          );
        }
        // Narrowest first, as in mockApi above.
        if (url.includes('/opening-hours/overrides')) return json(OVERRIDES);
        if (url.includes('/opening-hours')) return json(WEEK);
        if (url.includes('/table-types')) return json(TABLE_TYPES);
        if (url.includes('/booking-rules')) return json(RULES);
        if (url.includes('/pricing-rules')) return json(PRICING);
        if (url.includes('/settings/club')) return json(CLUB);
        return new Response(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    render();

    // Wait for the booking-rules section specifically. Querying all Save buttons too early
    // finds only the sections that have finished loading, and index 1 is then the wrong one.
    const increment = await screen.findByLabelText('Slot increment (minutes)');
    const rulesSection = increment.closest('section');
    await user.click(within(rulesSection!).getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'multiple of the 30-minute increment',
    );
  });

  it('marks the catch-all pricing rule, so staff can see the club can always price a booking', async () => {
    mockApi();
    render();

    expect(await screen.findByText('Standard hourly rate')).toBeInTheDocument();
    expect(screen.getByText('Everything')).toBeInTheDocument();
    expect(screen.getByText('£12.00')).toBeInTheDocument();
  });

  it('lists the special dates alongside the weekly hours, not instead of them', async () => {
    // Both sections read a path beginning /opening-hours. If the override list were served
    // the weekly rows, this section would render seven undated entries and the weekly one
    // would lose its days — which is exactly what a prefix match produces.
    mockApi();
    render();

    expect(await screen.findByText('Christmas Day')).toBeInTheDocument();
    expect(screen.getByLabelText('Monday opening time')).toBeInTheDocument();
  });

  it('sends the date and reason when special hours are saved', async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    render();

    await screen.findByText('Christmas Day');

    await user.type(screen.getByLabelText('Date'), '2026-12-26');
    await user.type(screen.getByLabelText('Reason'), 'Boxing Day');

    const reason = screen.getByLabelText('Reason');
    const section = reason.closest('section');
    await user.click(within(section!).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const put = calls.find(
        (call) => call.method === 'PUT' && call.url.includes('/opening-hours/overrides'),
      );
      expect(put?.body).toContain('2026-12-26');
      expect(put?.body).toContain('Boxing Day');
    });
  });

  it('offers the table types the server knows about, not a hardcoded list', async () => {
    // The point of item 14: a type a manager adds must appear here without a deployment.
    mockApi();
    render();

    expect(await screen.findByText('English pool')).toBeInTheDocument();
    // The code is shown too, because it is what pricing rules and the API refer to.
    expect(screen.getByText('ENGLISH_POOL')).toBeInTheDocument();
  });

  it('does not leave a failed removal\'s error over a special-hours save that worked', async () => {
    // Save and remove share one error banner in this section. Without each resetting the
    // other, a refused removal leaves its message sitting above a save that then succeeded —
    // so the save looks broken and staff try again.
    let failRemoval = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = (init?.method ?? 'GET').toUpperCase();
        if (url.includes('/opening-hours/overrides')) {
          if (method === 'DELETE') {
            return failRemoval
              ? json({ code: 'CONFLICT', message: 'Bookings exist on that date.' }, 409)
              : new Response(null, { status: 204 });
          }
          return method === 'GET' ? json(OVERRIDES) : json({ settings: OVERRIDES, warnings: [] });
        }
        if (url.includes('/opening-hours')) return method === 'GET' ? json(WEEK) : json({ settings: WEEK, warnings: [] });
        if (url.includes('/table-types')) return json(TABLE_TYPES);
        if (url.includes('/booking-rules')) return json(RULES);
        if (url.includes('/pricing-rules')) return json(PRICING);
        if (url.includes('/settings/club')) return json(CLUB);
        return new Response(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    render();

    await screen.findByText('Christmas Day');
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText(/Bookings exist on that date/)).toBeInTheDocument();

    // Now save a new override, which succeeds.
    failRemoval = false;
    await user.type(screen.getByLabelText('Date'), '2026-12-26');
    const section = screen.getByLabelText('Reason').closest('section');
    await user.click(within(section!).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(screen.queryByText(/Bookings exist on that date/)).not.toBeInTheDocument(),
    );
  });

  it('confirms a clean save, which previously produced no feedback at all', async () => {
    // The gap item 18 exists to close: a settings save with no warnings changed nothing on
    // screen, so staff could not tell a successful save from one that silently failed.
    mockApi();
    const user = userEvent.setup();
    render();

    await screen.findByLabelText('Monday opening time');
    await user.click(screen.getByRole('checkbox', { name: 'Monday closed' }));
    await user.click(screen.getAllByRole('button', { name: 'Save' })[0]!);

    expect(await screen.findByRole('status')).toHaveTextContent('Opening hours saved');
  });

  it('confirms the save and still lists the bookings it stranded', async () => {
    // The two are not alternatives. The toast says the save happened; the warnings say which
    // bookings it affected and must stay put — that is not a five-second read.
    mockApi(() =>
      json({
        settings: WEEK,
        warnings: [{ reference: 'SNK-ABC123', detail: 'The club would be closed on 2026-09-07.' }],
      }),
    );
    const user = userEvent.setup();
    render();

    await screen.findByLabelText('Monday opening time');
    await user.click(screen.getByRole('checkbox', { name: 'Monday closed' }));
    await user.click(screen.getAllByRole('button', { name: 'Save' })[0]!);

    expect(await screen.findByRole('status')).toHaveTextContent('Opening hours saved');
    expect(await screen.findByRole('alert')).toHaveTextContent('SNK-ABC123');
  });

  it('says nothing when the save was refused', async () => {
    // A confirmation after a failure is worse than none: staff would leave believing the club
    // had been reconfigured. The inline error is the only thing that should appear.
    mockApi(() => json({ code: 'VALIDATION_FAILED', message: 'Closing time must follow opening time.' }, 422));
    const user = userEvent.setup();
    render();

    await screen.findByLabelText('Monday opening time');
    await user.click(screen.getByRole('checkbox', { name: 'Monday closed' }));
    await user.click(screen.getAllByRole('button', { name: 'Save' })[0]!);

    expect(await screen.findByRole('alert')).toHaveTextContent('Closing time must follow');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('sends the label alone when a table type is added', async () => {
    // No code field: it is derived server-side, and a form with both invites a code that
    // disagrees with its label.
    const calls = mockApi();
    const user = userEvent.setup();
    render();

    await user.type(await screen.findByLabelText('New type'), 'Chinese pool');
    await user.click(screen.getByRole('button', { name: 'Add type' }));

    await waitFor(() => {
      const post = calls.find(
        (call) => call.method === 'POST' && call.url.includes('/table-types'),
      );
      expect(post?.body).toContain('Chinese pool');
      expect(post?.body).not.toContain('CHINESE_POOL');
    });
  });
});

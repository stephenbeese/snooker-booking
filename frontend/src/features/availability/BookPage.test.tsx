import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addDays, todayIso } from '@/lib/datetime';
import { makeAvailability, makeSlot, makeTable } from '@/test/factories';
import { renderWithRouter } from '@/test/renderWithProviders';
import type { DayAvailability } from './types';
import { BookPage } from './BookPage';

/**
 * Availability keyed by the requested duration, so a test can describe what the server says
 * at 60 minutes and what it says at 240 — which is the whole point: every bug in this file
 * was a case of the page trusting a stale answer after the duration changed.
 */
function mockAvailability(
  byDuration: Record<string, DayAvailability>,
  user = LOGGED_IN,
  clubAdvanceDays = 45,
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/api/auth/me')) {
        return json(user, user === null ? 401 : 200);
      }
      if (url.includes('/api/availability')) {
        const duration = new URL(url, 'http://test').searchParams.get('durationMinutes') ?? 'none';
        const payload = byDuration[duration] ?? byDuration['none'];
        return json(payload);
      }
      // The club's own booking window, which caps the date picker. Deliberately not 30: the
      // bug this guards against was a hardcoded 30 that happened to match the seed data, so a
      // fixture using 30 would pass either way.
      if (url.includes('/api/club')) {
        return json({ ...CLUB, maxAdvanceDays: clubAdvanceDays });
      }
      return new Response(null, { status: 204 });
    }),
  );
}

/** The club as `GET /api/club` returns it. Only `maxAdvanceDays` matters to this page. */
const CLUB = {
  name: 'The Snooker Club',
  description: null,
  contact: {
    addressLine1: null,
    addressLine2: null,
    city: null,
    postcode: null,
    phone: null,
    email: null,
    website: null,
  },
  openingHours: [],
  fromHourlyRatePence: 1200,
  minDurationMinutes: 30,
  maxAdvanceDays: 45,
};

const LOGGED_IN = {
  id: 1,
  email: 'customer@test.local',
  firstName: 'Test',
  lastName: 'Customer',
  phone: null,
  role: 'CUSTOMER',
};

/** Includes the 4-hour option the "no longer fits" tests switch to. */
const LONG_OPTIONS = [
  { minutes: 30, label: '30 mins' },
  { minutes: 60, label: '1 hour' },
  { minutes: 90, label: '1 hour 30 mins' },
  { minutes: 240, label: '4 hours' },
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** A grid whose single 10:00 slot is bookable, priced, and long enough. */
function bookableAt(minutes: number, price: number): DayAvailability {
  return makeAvailability({
    durationOptions: LONG_OPTIONS,
    requestedDurationMinutes: minutes,
    slotTimes: ['10:00:00'],
    tables: [
      makeTable({
        slots: [
          makeSlot({
            startTime: '10:00:00',
            bookableForRequestedDuration: true,
            pricePenceForRequestedDuration: price,
            maxDurationMinutes: 240,
          }),
        ],
      }),
    ],
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('BookPage', () => {
  it('shows the start and end time of the booking, not just the start', async () => {
    // The customer is about to pay. Seeing only "10:00" leaves the length of what they are
    // buying implicit — and it is chosen in a dropdown at the other end of the page.
    mockAvailability({ '60': bookableAt(60, 1200) });
    renderWithRouter(<BookPage />, { route: '/book', path: '/book' });

    await userEvent.click(await screen.findByRole('button', { name: /10:00 — available/ }));

    const summary = await screen.findByRole('complementary');
    expect(summary).toHaveTextContent('10:00–11:00');
    expect(summary).toHaveTextContent('1 hour');
    expect(summary).toHaveTextContent('£12.00');
  });

  it('reprices the selection when the duration changes', async () => {
    // The price shown must be the price of what is actually being booked. Snapshotting it at
    // click time quoted the old duration for a booking the server prices differently.
    mockAvailability({
      '60': bookableAt(60, 1200),
      '90': bookableAt(90, 1800),
    });
    renderWithRouter(<BookPage />, { route: '/book', path: '/book' });

    await userEvent.click(await screen.findByRole('button', { name: /10:00 — available/ }));
    expect(await screen.findByRole('complementary')).toHaveTextContent('£12.00');

    await userEvent.selectOptions(screen.getByLabelText('Duration'), '90');

    await waitFor(() =>
      expect(screen.getByRole('complementary')).toHaveTextContent('£18.00'),
    );
    expect(screen.getByRole('complementary')).toHaveTextContent('10:00–11:30');
  });

  it('drops the selection when the new duration no longer fits, and says why', async () => {
    // The reported bug: the selection survived, stayed green, and was submitted — the server
    // then rejected it for running past closing time.
    const tooLong = makeAvailability({
      durationOptions: LONG_OPTIONS,
      requestedDurationMinutes: 240,
      slotTimes: ['10:00:00'],
      tables: [
        makeTable({
          slots: [
            makeSlot({
              startTime: '10:00:00',
              bookableForRequestedDuration: false,
              pricePenceForRequestedDuration: null,
              maxDurationMinutes: 90,
            }),
          ],
        }),
      ],
    });
    mockAvailability({ '60': bookableAt(60, 1200), '240': tooLong });

    renderWithRouter(<BookPage />, { route: '/book', path: '/book' });
    await userEvent.click(await screen.findByRole('button', { name: /10:00 — available/ }));
    expect(await screen.findByRole('complementary')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Duration'), '240');

    await waitFor(() => expect(screen.queryByRole('complementary')).not.toBeInTheDocument());
    expect(await screen.findByRole('alert')).toHaveTextContent('only fits 1 hour 30 mins');
  });

  // The cell's own appearance once it stops fitting is pinned in slotAppearance.test.ts,
  // against the function that decides it. Asserting it here instead looked reasonable but
  // was untestable: the page clears the selection before such a cell can ever render, so the
  // assertion held whether or not the ordering bug was present.

  it('shortens the booking rather than ignoring a click on a slot that will not fit', async () => {
    // These cells used to be dead ends: 4 hours requested, 1 hour left before closing, click
    // refused. Now the click is honoured and the duration gives way — the customer named a
    // start time, which is the part they care about.
    //
    // The subtlety is that setting the selection alone would not survive: the slot fails
    // `bookableForRequestedDuration` at 240, so the stale-selection guard would clear it on
    // the very next render and the click would look like it did nothing. The duration has to
    // move with it.
    const tooShort = makeAvailability({
      durationOptions: LONG_OPTIONS,
      requestedDurationMinutes: 240,
      slotTimes: ['10:00:00'],
      tables: [
        makeTable({
          slots: [
            makeSlot({
              startTime: '10:00:00',
              bookableForRequestedDuration: false,
              maxDurationMinutes: 60,
              pricePenceForRequestedDuration: null,
            }),
          ],
        }),
      ],
    });
    mockAvailability({ '240': tooShort, '60': bookableAt(60, 1200) });
    renderWithRouter(<BookPage />, { route: '/book', path: '/book' });

    await userEvent.selectOptions(await screen.findByLabelText('Duration'), '240');
    await userEvent.click(await screen.findByRole('button', { name: /10:00 — Up to 1 hour/ }));

    // The selection survived, priced at the duration that actually fits.
    const summary = await screen.findByRole('complementary');
    expect(summary).toHaveTextContent('10:00–11:00');
    expect(summary).toHaveTextContent('£12.00');
    // And the duration control agrees, rather than still claiming 4 hours.
    await waitFor(() => expect(screen.getByLabelText('Duration')).toHaveValue('60'));
  });

  it('says why the booking got shorter, rather than silently changing it', async () => {
    // A duration that changes itself without explanation reads as a bug — especially as the
    // price changes with it.
    const tooShort = makeAvailability({
      durationOptions: LONG_OPTIONS,
      requestedDurationMinutes: 240,
      slotTimes: ['10:00:00'],
      tables: [
        makeTable({
          slots: [
            makeSlot({
              startTime: '10:00:00',
              bookableForRequestedDuration: false,
              maxDurationMinutes: 60,
            }),
          ],
        }),
      ],
    });
    mockAvailability({ '240': tooShort, '60': bookableAt(60, 1200) });
    renderWithRouter(<BookPage />, { route: '/book', path: '/book' });

    await userEvent.selectOptions(await screen.findByLabelText('Duration'), '240');
    await userEvent.click(await screen.findByRole('button', { name: /10:00 — Up to 1 hour/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '10:00 only fits 1 hour, so the duration was shortened.',
    );
  });

  it('clears the dropped-selection message once a fresh slot is picked', async () => {
    // A message about a selection two selections ago is noise that outlives its cause.
    const tooLong = makeAvailability({
      durationOptions: LONG_OPTIONS,
      requestedDurationMinutes: 240,
      slotTimes: ['10:00:00', '10:30:00'],
      tables: [
        makeTable({
          slots: [
            makeSlot({
              startTime: '10:00:00',
              bookableForRequestedDuration: false,
              maxDurationMinutes: 90,
            }),
            makeSlot({
              startTime: '10:30:00',
              bookableForRequestedDuration: true,
              pricePenceForRequestedDuration: 4800,
              maxDurationMinutes: 240,
            }),
          ],
        }),
      ],
    });
    mockAvailability({ '60': bookableAt(60, 1200), '240': tooLong });

    renderWithRouter(<BookPage />, { route: '/book', path: '/book' });
    await userEvent.click(await screen.findByRole('button', { name: /10:00 — available/ }));
    await userEvent.selectOptions(screen.getByLabelText('Duration'), '240');
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /10:30 — available/ }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it("lets the customer reach the whole window the club sells, not a fixed month", async () => {
    // The item 19 defect, at the level that actually mattered: DateSelector had a sane cap all
    // along, but BookPage never passed one, so the 30-day default silently overrode a club
    // selling 45 days ahead. Testing the component alone would not have caught the missing prop.
    mockAvailability({ '60': bookableAt(60, 1200) }, LOGGED_IN, 45);
    renderWithRouter(<BookPage />, { route: '/book', path: '/book' });

    const input = await screen.findByLabelText('Booking date');
    await waitFor(() => expect(input).toHaveAttribute('max', addDays(todayIso(), 45)));
  });

  it('names each part of the selection rather than running them together', async () => {
    // Item 19's visual pass. The customer is one click from paying, so what they are buying is
    // labelled — table, date, time, duration, total — instead of being inferred from the order
    // of things separated by dots.
    mockAvailability({ '60': bookableAt(60, 1200) });
    renderWithRouter(<BookPage />, { route: '/book', path: '/book' });

    await userEvent.click(await screen.findByRole('button', { name: /10:00 — available/ }));

    const summary = await screen.findByRole('complementary');
    for (const label of ['Table', 'Date', 'Time', 'Duration', 'Total']) {
      expect(within(summary).getByText(label)).toBeInTheDocument();
    }
    expect(within(summary).getByText('£12.00')).toBeInTheDocument();
  });

  it('explains why booking is unavailable when no duration is chosen', async () => {
    // "Any" leaves the server unable to price or check the fit, so the button is disabled.
    // Disabled with no reason reads as a broken page.
    mockAvailability({ none: makeAvailability({ slotTimes: ['10:00:00'] }) });
    renderWithRouter(<BookPage />, { route: '/book', path: '/book' });

    await userEvent.selectOptions(await screen.findByLabelText('Duration'), '');
    await userEvent.click(await screen.findByRole('button', { name: /10:00 — available/ }));

    const summary = await screen.findByRole('complementary');
    expect(summary).toHaveTextContent('Choose a duration to book.');
    expect(screen.getByRole('button', { name: 'Book and pay' })).toBeDisabled();
  });
});

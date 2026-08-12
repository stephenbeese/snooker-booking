import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithRouter } from '@/test/renderWithProviders';
import type { Club } from '@/features/club/types';
import { HomePage } from './HomePage';

function aClub(overrides: Partial<Club> = {}): Club {
  return {
    name: 'The Snooker Club',
    description: 'Championship tables, open seven days a week.',
    contact: {
      addressLine1: '1 High Street',
      addressLine2: null,
      city: 'Manchester',
      postcode: 'M1 1AA',
      phone: '0161 000 0000',
      email: 'bookings@snookerclub.example',
      website: null,
    },
    openingHours: [
      { dayOfWeek: 1, closed: false, openTime: '10:00:00', closeTime: '23:00:00' },
      { dayOfWeek: 2, closed: false, openTime: '10:00:00', closeTime: '23:00:00' },
      { dayOfWeek: 3, closed: true, openTime: null, closeTime: null },
      { dayOfWeek: 4, closed: false, openTime: '10:00:00', closeTime: '23:00:00' },
      { dayOfWeek: 5, closed: false, openTime: '10:00:00', closeTime: '23:00:00' },
      { dayOfWeek: 6, closed: false, openTime: '10:00:00', closeTime: '23:00:00' },
      { dayOfWeek: 7, closed: false, openTime: '12:00:00', closeTime: '20:00:00' },
    ],
    fromHourlyRatePence: 1200,
    minDurationMinutes: 30,
    maxAdvanceDays: 30,
    ...overrides,
  };
}

/** /api/club resolves; /api/auth/me answers 204, i.e. nobody is signed in. */
function mockApi(club: Club) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/club')) {
        return new Response(JSON.stringify(club), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(null, { status: 204 });
    }),
  );
}

describe('HomePage', () => {
  beforeEach(() => {
    // A Wednesday, so the "Today" assertions below are about the component's logic and
    // not about whichever day the suite happens to run on.
    //
    // Only Date is faked. Faking the timer functions as well would freeze the clock that
    // testing-library's findBy* polling runs on, and every async query would time out
    // waiting for a tick that never comes.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-12T12:00:00Z'));
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows the configured club name and description', async () => {
    mockApi(aClub({ name: 'Crucible Snooker Hall' }));
    renderWithRouter(<HomePage />);

    // Awaited on the description, not the heading. The heading falls back to a hardcoded
    // name while the request is in flight, so awaiting it would resolve against the
    // placeholder and let a synchronous assertion run before the data ever arrived.
    expect(
      await screen.findByText('Championship tables, open seven days a week.'),
    ).toBeInTheDocument();
    // A name distinct from the fallback, so this genuinely proves the server's value won.
    expect(
      screen.getByRole('heading', { name: 'Crucible Snooker Hall', level: 1 }),
    ).toBeInTheDocument();
  });

  it('advertises the rate the server sent, formatted as currency', async () => {
    mockApi(aClub({ fromHourlyRatePence: 850 }));
    renderWithRouter(<HomePage />);

    expect(await screen.findByText('£8.50')).toBeInTheDocument();
  });

  it('renders every weekday, including one the club is closed on', async () => {
    mockApi(aClub());
    renderWithRouter(<HomePage />);

    // Wednesday is closed in the fixture. Rendering a time range here would mean the
    // page had fallen back to the stale open_time/close_time columns.
    const wednesday = (await screen.findByText(/^Wednesday/)).closest('div');
    expect(wednesday).not.toBeNull();
    expect(within(wednesday as HTMLElement).getByText('Closed')).toBeInTheDocument();

    expect(screen.getByText('12:00 – 20:00')).toBeInTheDocument();
  });

  it("marks today's row and no other", async () => {
    mockApi(aClub());
    renderWithRouter(<HomePage />);

    const todayLabels = await screen.findAllByText('Today');
    expect(todayLabels).toHaveLength(1);
    // 2026-08-12 is a Wednesday.
    expect(todayLabels[0]?.closest('dt')).toHaveTextContent('Wednesday');
  });

  it('offers a route into the booking flow', async () => {
    mockApi(aClub());
    renderWithRouter(<HomePage />);

    const bookLinks = await screen.findAllByRole('link', { name: /book a table/i });
    expect(bookLinks.length).toBeGreaterThan(0);
    expect(bookLinks[0]).toHaveAttribute('href', '/book');
  });

  it('still renders while the club details are loading', () => {
    // The API never resolves here: the page must not depend on it to paint. A home page
    // that renders nothing until a request completes is a blank screen to a first visitor.
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    renderWithRouter(<HomePage />);

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /how it works/i })).toBeInTheDocument();
  });
});

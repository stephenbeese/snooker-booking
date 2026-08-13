import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithRouter } from '@/test/renderWithProviders';
import { PricingRules } from './PricingRules';

const CATCH_ALL = {
  id: 1,
  name: 'Standard hourly rate',
  tableType: null,
  daysOfWeek: [],
  startTime: null,
  endTime: null,
  hourlyRatePence: 1200,
  priority: 0,
  active: true,
  catchAll: true,
};

const PEAK = {
  id: 2,
  name: 'Friday evenings',
  tableType: 'SNOOKER',
  daysOfWeek: ['FRIDAY'],
  startTime: '18:00:00',
  endTime: '23:00:00',
  hourlyRatePence: 1800,
  priority: 10,
  active: true,
  catchAll: false,
};

const WEEK_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** @returns the calls made, so a test can assert what actually went to the server. */
function mockApi(rules: unknown[] = [CATCH_ALL, PEAK], onWrite?: () => Response) {
  const calls: { url: string; method: string; body: string | null }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      calls.push({ url, method, body: typeof init?.body === 'string' ? init.body : null });

      if (url.includes('/pricing-rules')) {
        if (method === 'GET') return json(rules);
        return onWrite ? onWrite() : json({ ...CATCH_ALL, id: 3 }, method === 'POST' ? 201 : 200);
      }
      return new Response(null, { status: 204 });
    }),
  );
  return calls;
}

function render() {
  return renderWithRouter(<PricingRules />, {
    route: '/admin/settings',
    path: '/admin/settings',
  });
}

describe('PricingRules', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists each rule with what it applies to', async () => {
    mockApi();
    render();

    expect(await screen.findByText('Standard hourly rate')).toBeInTheDocument();
    expect(screen.getByText('Everything')).toBeInTheDocument();
    expect(screen.getByText('£12.00')).toBeInTheDocument();

    // The narrowed rule must say what narrows it, or staff cannot tell why one rule beats
    // another — the table is the only place the interaction between rules is visible.
    expect(screen.getByText('Snooker, Fri, 18:00–23:00')).toBeInTheDocument();
    expect(screen.getByText('£18.00')).toBeInTheDocument();
  });

  it('sends the rate in pence when a rate is edited', async () => {
    // The conversion that matters: the field is pounds because that is what a person types,
    // and the API is pence because floats cannot hold money.
    const calls = mockApi();
    const user = userEvent.setup();
    render();

    await screen.findByText('Friday evenings');
    const peakRow = screen.getByText('Friday evenings').closest('tr')!;
    await user.click(within(peakRow).getByRole('button', { name: 'Edit' }));

    const rate = await screen.findByLabelText('Rate per hour (£)');
    expect(rate).toHaveValue(18);

    await user.clear(rate);
    await user.type(rate, '22.50');
    await user.click(screen.getByRole('button', { name: 'Save rule' }));

    const put = await vi.waitFor(() => {
      const found = calls.find((call) => call.method === 'PUT');
      expect(found).toBeDefined();
      return found!;
    });

    const sent = JSON.parse(put.body ?? '{}');
    expect(sent.hourlyRatePence).toBe(2250);
    // The URL must name the rule being edited; the body deliberately carries no id.
    expect(put.url).toContain('/pricing-rules/2');
  });

  it('keeps the price unchanged when a rule is opened and saved untouched', async () => {
    // The round trip through pounds must not shave a penny off a rate nobody edited.
    const calls = mockApi();
    const user = userEvent.setup();
    render();

    await screen.findByText('Friday evenings');
    const peakRow = screen.getByText('Friday evenings').closest('tr')!;
    await user.click(within(peakRow).getByRole('button', { name: 'Edit' }));
    await screen.findByLabelText('Rate per hour (£)');
    await user.click(screen.getByRole('button', { name: 'Save rule' }));

    const put = await vi.waitFor(() => {
      const found = calls.find((call) => call.method === 'PUT');
      expect(found).toBeDefined();
      return found!;
    });
    expect(JSON.parse(put.body ?? '{}').hourlyRatePence).toBe(1800);
  });

  it('creates a new rule with POST and converts "any" to null', async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    render();

    await screen.findByText('Standard hourly rate');
    await user.click(screen.getByRole('button', { name: 'Add a pricing rule' }));

    await user.type(await screen.findByLabelText('Rule name'), 'Student rate');
    const rate = screen.getByLabelText('Rate per hour (£)');
    await user.clear(rate);
    await user.type(rate, '8');
    await user.click(screen.getByRole('button', { name: 'Save rule' }));

    const post = await vi.waitFor(() => {
      const found = calls.find((call) => call.method === 'POST');
      expect(found).toBeDefined();
      return found!;
    });

    const sent = JSON.parse(post.body ?? '{}');
    expect(sent).toMatchObject({ name: 'Student rate', hourlyRatePence: 800 });
    // A select cannot hold null, so the form uses ''. Sending '' would be a request to match
    // the empty table type, which matches nothing, and the rule would never apply.
    expect(sent.tableType).toBeNull();
    // Empty, not null and not a list of seven: the wire's "every day".
    expect(sent.daysOfWeek).toEqual([]);
    expect(sent.startTime).toBeNull();
  });

  it('sends every ticked day, so one rule can cover Monday to Thursday', async () => {
    // The whole point of the change: before this, "Mon–Thu at £10" needed four rules kept in
    // step by hand, and the list showed four rows for one intent.
    const calls = mockApi();
    const user = userEvent.setup();
    render();

    await screen.findByText('Standard hourly rate');
    await user.click(screen.getByRole('button', { name: 'Add a pricing rule' }));
    await user.type(await screen.findByLabelText('Rule name'), 'Early week');

    // The checkboxes live inside a dropdown, so it has to be opened first — which is also
    // the interaction a real user performs.
    await user.click(screen.getByRole('button', { name: /^Days/ }));
    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday']) {
      await user.click(screen.getByRole('checkbox', { name: day }));
    }
    await user.click(screen.getByRole('button', { name: 'Save rule' }));

    const post = await vi.waitFor(() => {
      const found = calls.find((call) => call.method === 'POST');
      expect(found).toBeDefined();
      return found!;
    });

    expect(JSON.parse(post.body ?? '{}').daysOfWeek).toEqual([
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
    ]);
  });

  it('treats all seven days as "every day"', async () => {
    // Both mean the same thing to the matcher, so normalising to empty keeps one
    // representation in the database rather than two that behave alike — and keeps the rule
    // showing as a catch-all rather than as a list of seven.
    const calls = mockApi();
    const user = userEvent.setup();
    render();

    await screen.findByText('Standard hourly rate');
    await user.click(screen.getByRole('button', { name: 'Add a pricing rule' }));
    await user.type(await screen.findByLabelText('Rule name'), 'All week');

    await user.click(screen.getByRole('button', { name: /^Days/ }));
    for (const day of WEEK_NAMES) {
      await user.click(screen.getByRole('checkbox', { name: day }));
    }
    await user.click(screen.getByRole('button', { name: 'Save rule' }));

    const post = await vi.waitFor(() => {
      const found = calls.find((call) => call.method === 'POST');
      expect(found).toBeDefined();
      return found!;
    });
    expect(JSON.parse(post.body ?? '{}').daysOfWeek).toEqual([]);
  });

  it("ticks the rule's existing days when it is opened for editing", async () => {
    // Otherwise editing a rate on a Friday-only rule would silently widen it to every day.
    const calls = mockApi();
    const user = userEvent.setup();
    render();

    await screen.findByText('Friday evenings');
    const peakRow = screen.getByText('Friday evenings').closest('tr')!;
    await user.click(within(peakRow).getByRole('button', { name: 'Edit' }));

    // The closed button must already say which days are set, without opening it.
    expect(await screen.findByRole('button', { name: /^Days.*Fri/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Days/ }));
    expect(screen.getByRole('checkbox', { name: 'Friday' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Monday' })).not.toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Save rule' }));
    const put = await vi.waitFor(() => {
      const found = calls.find((call) => call.method === 'PUT');
      expect(found).toBeDefined();
      return found!;
    });
    expect(JSON.parse(put.body ?? '{}').daysOfWeek).toEqual(['FRIDAY']);
  });

  it('summarises common day sets in words', async () => {
    // "Weekdays" is what staff mean; five day names buries it.
    mockApi([
      CATCH_ALL,
      { ...PEAK, id: 5, name: 'Weekday rate', daysOfWeek: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'], startTime: null, endTime: null, tableType: null },
      { ...PEAK, id: 6, name: 'Weekend rate', daysOfWeek: ['SATURDAY', 'SUNDAY'], startTime: null, endTime: null, tableType: null },
    ]);
    render();

    expect(await screen.findByText('Weekdays')).toBeInTheDocument();
    expect(screen.getByText('Weekends')).toBeInTheDocument();
  });

  it('does not leave one operation’s error showing over the next', async () => {
    // The two mutations shared a single error message with nothing resetting it, so a failed
    // delete left its banner on screen while the user edited a name — which reads exactly
    // like the edit having failed.
    let failDelete = true;
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = (init?.method ?? 'GET').toUpperCase();
        calls.push(method);
        if (!url.includes('/pricing-rules')) return new Response(null, { status: 204 });
        if (method === 'GET') return json([CATCH_ALL, PEAK]);
        if (method === 'DELETE' && failDelete) {
          return json({ code: 'CONFLICT', message: 'That rule is in use.' }, 409);
        }
        return json({ ...PEAK }, 200);
      }),
    );

    const user = userEvent.setup();
    render();

    await screen.findByText('Friday evenings');
    const peakRow = screen.getByText('Friday evenings').closest('tr')!;
    await user.click(within(peakRow).getByRole('button', { name: 'Delete Friday evenings' }));
    await user.click(within(peakRow).getByRole('button', { name: 'Confirm delete' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('That rule is in use.');

    // Now save successfully. The delete's error must not survive into it.
    failDelete = false;
    await user.click(within(peakRow).getByRole('button', { name: 'Edit' }));
    await user.click(await screen.findByRole('button', { name: 'Save rule' }));

    await vi.waitFor(() => {
      expect(screen.queryByText('That rule is in use.')).not.toBeInTheDocument();
    });
  });

  it('shows the delete failure, not a stale save failure', async () => {
    // The distinguishing case. A successful mutation clears the other's error by itself, so
    // only a *failing* save followed by a *failing* delete shows whether the two are really
    // separate — otherwise staff see "Could not save that pricing rule" after a delete and
    // go looking at the form.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = (init?.method ?? 'GET').toUpperCase();
        if (!url.includes('/pricing-rules')) return new Response(null, { status: 204 });
        if (method === 'GET') return json([CATCH_ALL, PEAK]);
        if (method === 'DELETE') {
          return json({ code: 'CONFLICT', message: 'Delete refused.' }, 409);
        }
        return json({ code: 'VALIDATION_FAILED', message: 'Save refused.' }, 422);
      }),
    );

    const user = userEvent.setup();
    render();

    await screen.findByText('Friday evenings');
    const peakRow = screen.getByText('Friday evenings').closest('tr')!;

    // Fail a save first.
    await user.click(within(peakRow).getByRole('button', { name: 'Edit' }));
    await user.click(await screen.findByRole('button', { name: 'Save rule' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Save refused.');

    // Then fail a delete. The message must change to the delete's.
    await user.click(within(peakRow).getByRole('button', { name: 'Delete Friday evenings' }));
    await user.click(within(peakRow).getByRole('button', { name: 'Confirm delete' }));

    await vi.waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Delete refused.');
    });
    expect(screen.queryByText('Save refused.')).not.toBeInTheDocument();
  });

  it('does not strand the row on "Confirm delete" when the delete is refused', async () => {
    // Otherwise the only button on offer is one that keeps failing, with nothing to say the
    // attempt happened at all.
    mockApi([CATCH_ALL, PEAK], () => json({ code: 'CONFLICT', message: 'Nope.' }, 409));
    const user = userEvent.setup();
    render();

    await screen.findByText('Friday evenings');
    const peakRow = screen.getByText('Friday evenings').closest('tr')!;
    await user.click(within(peakRow).getByRole('button', { name: 'Delete Friday evenings' }));
    await user.click(within(peakRow).getByRole('button', { name: 'Confirm delete' }));

    await vi.waitFor(() => {
      expect(
        within(peakRow).queryByRole('button', { name: 'Confirm delete' }),
      ).not.toBeInTheDocument();
    });
    expect(within(peakRow).getByRole('button', { name: 'Delete Friday evenings' })).toBeVisible();
  });

  it('warns when more than one active rule matches everything', async () => {
    // Legal but almost never intended: the lower-priority one can never win, so it looks
    // active while doing nothing — and staff editing "the fallback rate" have even odds of
    // editing the one with no effect.
    mockApi([CATCH_ALL, { ...CATCH_ALL, id: 9, name: 'Second fallback' }]);
    render();

    const warning = await screen.findByText(/2 active rules apply to everything/);
    // The names must be in the warning itself, not merely somewhere on the page — they are
    // how staff work out which rule is the redundant one.
    expect(warning).toHaveTextContent('Standard hourly rate');
    expect(warning).toHaveTextContent('Second fallback');
  });

  it('will not let staff delete the last rule that can price anything', async () => {
    // Deleting it makes PricingService throw on every booking — the club silently stops
    // selling. The server refuses; this proves staff are told before they click, not after.
    mockApi([CATCH_ALL, PEAK]);
    render();

    const catchAllRow = (await screen.findByText('Standard hourly rate')).closest('tr')!;
    expect(within(catchAllRow).queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
    expect(within(catchAllRow).getByText(/Required/)).toBeInTheDocument();

    // The narrowed rule is freely deletable — the guard must not block everything.
    const peakRow = screen.getByText('Friday evenings').closest('tr')!;
    expect(within(peakRow).getByRole('button', { name: 'Delete Friday evenings' })).toBeEnabled();
  });

  it('allows deleting a catch-all when another active one remains', async () => {
    // The guard is "the last one", not "any catch-all". Getting this wrong would make the
    // club's fallback rate permanently uneditable.
    const second = { ...CATCH_ALL, id: 9, name: 'Second fallback' };
    mockApi([CATCH_ALL, second]);
    render();

    const row = (await screen.findByText('Second fallback')).closest('tr')!;
    expect(within(row).getByRole('button', { name: 'Delete Second fallback' })).toBeEnabled();
  });

  it('asks for confirmation before deleting', async () => {
    // A single click that destroys a pricing rule is too easy to hit by accident.
    const calls = mockApi();
    const user = userEvent.setup();
    render();

    await screen.findByText('Friday evenings');
    const peakRow = screen.getByText('Friday evenings').closest('tr')!;
    await user.click(within(peakRow).getByRole('button', { name: 'Delete Friday evenings' }));

    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);

    await user.click(within(peakRow).getByRole('button', { name: 'Confirm delete' }));
    await vi.waitFor(() => {
      expect(calls.some((call) => call.method === 'DELETE')).toBe(true);
    });
  });

  it('refuses a start time with no end time before contacting the server', async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    render();

    await screen.findByText('Standard hourly rate');
    await user.click(screen.getByRole('button', { name: 'Add a pricing rule' }));

    await user.type(await screen.findByLabelText('Rule name'), 'Half a window');
    await user.type(screen.getByLabelText('From (optional)'), '18:00');
    await user.click(screen.getByRole('button', { name: 'Save rule' }));

    expect(await screen.findByText(/both a start and an end time/i)).toBeInTheDocument();
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it("surfaces the server's refusal rather than failing silently", async () => {
    // The client-side catch-all check is a courtesy; the server is the authority. When the
    // two disagree — a rule changed in another tab — staff must see why the save failed.
    mockApi([CATCH_ALL, PEAK], () =>
      json(
        {
          code: 'VALIDATION_FAILED',
          message: 'At least one active rule must apply to every table at every time.',
        },
        422,
      ),
    );
    const user = userEvent.setup();
    render();

    await screen.findByText('Friday evenings');
    const peakRow = screen.getByText('Friday evenings').closest('tr')!;
    await user.click(within(peakRow).getByRole('button', { name: 'Edit' }));
    await screen.findByLabelText('Rate per hour (£)');
    await user.click(screen.getByRole('button', { name: 'Save rule' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'At least one active rule must apply',
    );
  });
});

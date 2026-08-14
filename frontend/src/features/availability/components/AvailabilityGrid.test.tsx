import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeAvailability, makeSlot, makeTable } from '@/test/factories';
import { AvailabilityGrid } from './AvailabilityGrid';

function renderGrid(
  availability = makeAvailability(),
  selected: { tableId: number; startAt: string } | null = null,
  durationMinutes: number | null = null,
) {
  const onSelect = vi.fn();
  render(
    <AvailabilityGrid
      availability={availability}
      selected={selected}
      durationMinutes={durationMinutes}
      onSelect={onSelect}
    />,
  );
  return { onSelect };
}

/** The cells that are part of the current booking, in grid order. */
function bookingCells() {
  return screen
    .getAllByRole('button')
    .filter((button) => button.getAttribute('aria-pressed') === 'true');
}

describe('AvailabilityGrid', () => {
  it('renders a row per table and a column per slot time', () => {
    renderGrid(
      makeAvailability({
        tables: [
          makeTable({ tableId: 1, tableName: 'Table 1' }),
          makeTable({ tableId: 2, tableName: 'Match Table' }),
        ],
      }),
    );

    expect(screen.getByRole('rowheader', { name: /Table 1/ })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: /Match Table/ })).toBeInTheDocument();
    // Three slot columns, two rows -> six cells.
    expect(screen.getAllByRole('button', { name: /available/ })).toHaveLength(6);
  });

  it('shows the hourly rate per table', () => {
    renderGrid(makeAvailability({ tables: [makeTable({ hourlyRatePence: 1250 })] }));

    expect(screen.getByText(/£12\.50\/hr/)).toBeInTheDocument();
  });

  it('shows a range when the rate changes during the day', () => {
    // A single figure would be a quote the club does not honour after the peak rule starts.
    // The row header is the only place a customer sees a rate before choosing a duration.
    renderGrid(
      makeAvailability({
        tables: [
          makeTable({
            hourlyRatePence: 750,
            highestHourlyRatePence: 2000,
            varyingRate: true,
          }),
        ],
      }),
    );

    expect(screen.getByText(/£7\.50–£20\.00\/hr/)).toBeInTheDocument();
  });

  it('does not render a pointless range when every slot costs the same', () => {
    // "£12.00–£12.00/hr" is worse than the single figure it replaced.
    renderGrid(
      makeAvailability({
        tables: [
          makeTable({
            hourlyRatePence: 1200,
            highestHourlyRatePence: 1200,
            varyingRate: false,
          }),
        ],
      }),
    );

    expect(screen.getByText(/£12\.00\/hr/)).toBeInTheDocument();
    expect(screen.queryByText(/£12\.00–/)).not.toBeInTheDocument();
  });

  it('calls back with the table and slot when an available cell is clicked', async () => {
    const { onSelect } = renderGrid();

    await userEvent.click(screen.getAllByRole('button', { name: /10:00 — available/ })[0]!);

    expect(onSelect).toHaveBeenCalledWith(1, expect.objectContaining({ startTime: '10:00:00' }));
  });

  it('does not call back when an unavailable cell is clicked', async () => {
    const { onSelect } = renderGrid(
      makeAvailability({
        tables: [
          makeTable({
            slots: [makeSlot({ startTime: '10:00:00', available: false, reason: 'BOOKED' })],
          }),
        ],
        slotTimes: ['10:00:00'],
      }),
    );

    const cell = screen.getByRole('button', { name: /Already booked/ });
    expect(cell).toBeDisabled();

    await userEvent.click(cell);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('explains a closed day instead of rendering an empty grid', () => {
    renderGrid(
      makeAvailability({
        clubOpen: false,
        dayUnavailableReason: 'CLUB_CLOSED',
        slotTimes: [],
        tables: [],
      }),
    );

    expect(screen.getByRole('status')).toHaveTextContent('The club is closed on this day.');
  });

  it('says the day is over rather than that the date has passed', () => {
    // Visiting after the last slot: the date has not passed, the trading day has. The old
    // "This date has already passed" reads as a bug to someone standing in the club.
    renderGrid(
      makeAvailability({
        clubOpen: true,
        dayUnavailableReason: 'PAST',
        slotTimes: [],
        tables: [],
      }),
    );

    expect(screen.getByRole('status')).toHaveTextContent('There are no more slots today.');
  });

  it('still reports a genuinely past date as past', () => {
    renderGrid(
      makeAvailability({
        clubOpen: false,
        dayUnavailableReason: 'PAST',
        slotTimes: [],
        tables: [],
      }),
    );

    expect(screen.getByRole('status')).toHaveTextContent('This date has already passed.');
  });

  it('explains a date that is too far ahead', () => {
    renderGrid(
      makeAvailability({
        clubOpen: true,
        dayUnavailableReason: 'TOO_FAR_IN_ADVANCE',
        slotTimes: [],
        tables: [],
      }),
    );

    expect(screen.getByRole('status')).toHaveTextContent('too far ahead');
  });

  it('flags an out-of-service table on its row', () => {
    renderGrid(
      makeAvailability({
        tables: [
          makeTable({
            tableActive: false,
            slots: [makeSlot({ startTime: '10:00:00', available: false, reason: 'TABLE_INACTIVE' })],
          }),
        ],
        slotTimes: ['10:00:00'],
      }),
    );

    expect(screen.getByRole('rowheader', { name: /out of service/ })).toBeInTheDocument();
  });

  it('marks the selected cell as pressed for assistive technology', () => {
    renderGrid(makeAvailability(), { tableId: 1, startAt: '2026-08-20T10:00:00Z' });

    expect(screen.getByRole('button', { name: /10:00 — selected/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('highlights every cell the booking covers, not just the start', () => {
    // The defect this exists for: a 90-minute booking from 10:00 lit only the 10:00 cell, so
    // 10:30 and 11:00 still looked like free time somebody else could take.
    renderGrid(makeAvailability(), { tableId: 1, startAt: '2026-08-20T10:00:00Z' }, 90);

    expect(bookingCells()).toHaveLength(3);
  });

  it('covers only as many cells as the duration asks for', () => {
    renderGrid(makeAvailability(), { tableId: 1, startAt: '2026-08-20T10:00:00Z' }, 60);

    expect(bookingCells()).toHaveLength(2);
  });

  it('draws the run as one bar, rounding only its outer corners', () => {
    // Square inner corners are what make three buttons read as a single block. Rounding every
    // cell would give a row of separate lozenges, which is what the old grid looked like.
    renderGrid(makeAvailability(), { tableId: 1, startAt: '2026-08-20T10:00:00Z' }, 90);

    const [start, middle, end] = bookingCells();
    expect(start!.className).toContain('rounded-l-lg');
    expect(middle!.className).not.toContain('rounded');
    expect(end!.className).toContain('rounded-r-lg');
  });

  it('leaves the middle of a run unlabelled so it does not read as separate picks', () => {
    renderGrid(makeAvailability(), { tableId: 1, startAt: '2026-08-20T10:00:00Z' }, 90);

    const [, middle] = bookingCells();
    expect(middle!.textContent?.trim()).toBe('');
  });

  it('tells a screen reader what the whole booking covers, from any cell in it', () => {
    renderGrid(makeAvailability(), { tableId: 1, startAt: '2026-08-20T10:00:00Z' }, 90);

    const [, middle] = bookingCells();
    expect(middle).toHaveAccessibleName('Part of your booking, 10:00 to 11:30');
  });

  it('labels the far end with when the booking finishes, not when its last cell starts', () => {
    // A 10:00 booking for 90 minutes ends at 11:30, but its last half-hour cell *starts* at
    // 11:00 — so the bar read "10:00 … 11:00" for a booking that runs to half past.
    renderGrid(makeAvailability(), { tableId: 1, startAt: '2026-08-20T10:00:00Z' }, 90);

    const cells = bookingCells();
    expect(cells[0]!.textContent?.trim()).toBe('10:00');
    expect(cells[cells.length - 1]!.textContent?.trim()).toBe('11:30');
  });

  it('spans a booking that runs past the last bookable start time', () => {
    // `bookableForRequestedDuration` answers "could a booking of this length START here",
    // which is false for every cell near closing — but those are exactly the cells a long
    // booking occupies. Reading it here collapsed the bar to its first cell whenever the
    // selection ran towards the end of the day.
    const table = makeTable({
      slots: [
        makeSlot({ startTime: '10:00:00', bookableForRequestedDuration: true }),
        makeSlot({ startTime: '10:30:00', bookableForRequestedDuration: false }),
        makeSlot({ startTime: '11:00:00', bookableForRequestedDuration: false }),
      ],
    });
    renderGrid(
      makeAvailability({ tables: [table] }),
      { tableId: 1, startAt: '2026-08-20T10:00:00Z' },
      90,
    );

    expect(bookingCells()).toHaveLength(3);
  });

  it('stops the run at a cell that is already taken', () => {
    // A booking is refused if anything in its way is occupied, so painting the bar through a
    // taken cell would show a booking the club will not sell. The server normally refuses the
    // start cell first — the grid must not rely on that to avoid drawing the lie.
    const table = makeTable({
      slots: [
        makeSlot({ startTime: '10:00:00' }),
        makeSlot({ startTime: '10:30:00', available: false, reason: 'BOOKED' }),
        makeSlot({ startTime: '11:00:00' }),
      ],
    });
    renderGrid(
      makeAvailability({ tables: [table] }),
      { tableId: 1, startAt: '2026-08-20T10:00:00Z' },
      90,
    );

    expect(bookingCells()).toHaveLength(1);
  });

  it('highlights the anchor alone when no duration has been chosen', () => {
    renderGrid(makeAvailability(), { tableId: 1, startAt: '2026-08-20T10:00:00Z' }, null);

    expect(bookingCells()).toHaveLength(1);
  });

  it('never spans across a different table', () => {
    renderGrid(
      makeAvailability({
        tables: [makeTable({ tableId: 1 }), makeTable({ tableId: 2, tableName: 'Table 2' })],
      }),
      { tableId: 1, startAt: '2026-08-20T10:00:00Z' },
      90,
    );

    // Three cells on table 1, none on table 2 — the two rows share slot start times, so a
    // span keyed on time alone rather than on the row would light both.
    expect(bookingCells()).toHaveLength(3);
  });

  it('keeps padding off the scrolling element, so nothing shows past the sticky column', () => {
    // `position: sticky; left: 0` pins to the scroll container's PADDING box. Padding on the
    // scroller itself therefore leaves an uncovered strip down the left, and the time axis
    // scrolls through it — visible as fragments of times beside the table names, which is the
    // defect this grid was rebuilt to fix. jsdom does no layout, so the guard is structural:
    // the element that scrolls must not be the element that pads.
    const { container } = render(
      <AvailabilityGrid
        availability={makeAvailability()}
        selected={null}
        durationMinutes={null}
        onSelect={vi.fn()}
      />,
    );

    const scroller = container.querySelector('.overflow-x-auto')!;
    expect(scroller.className).not.toMatch(/\bp-\d/);
    expect(scroller.className).not.toMatch(/\bpx-\d/);
    expect(scroller.className).not.toMatch(/\bpl-\d/);
  });

  it('sizes a half-hour the same whatever the day, rather than stretching to fill the card', () => {
    // `w-full` made the cell width a function of how many columns there happened to be: a full
    // trading day squeezed to 38px cells — too narrow for "22:30" — while six slots left at the
    // end of an evening ballooned to 130px. `table-fixed` is what makes the column widths
    // binding; under auto layout the browser treats them as suggestions and redistributes.
    // jsdom does no layout, so this asserts the mechanism rather than the measurement.
    const { container } = render(
      <AvailabilityGrid
        availability={makeAvailability()}
        selected={null}
        durationMinutes={null}
        onSelect={vi.fn()}
      />,
    );

    const table = container.querySelector('table')!;
    expect(table.className).toContain('table-fixed');
    expect(table.className).not.toContain('w-full');
  });

  it('shows each table its type, which the row never used to say', () => {
    renderGrid(
      makeAvailability({ tables: [makeTable({ tableType: 'ENGLISH_POOL' })], slotTimes: ['10:00:00'] }),
    );

    // No typeLabel passed, so nothing is claimed about the code — the row must not print a
    // raw ENGLISH_POOL at a customer.
    expect(screen.queryByText('ENGLISH_POOL')).toBeNull();
  });
});

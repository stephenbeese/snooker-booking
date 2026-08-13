import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeAvailability, makeSlot, makeTable } from '@/test/factories';
import { AvailabilityGrid } from './AvailabilityGrid';

function renderGrid(
  availability = makeAvailability(),
  selected: { tableId: number; startAt: string } | null = null,
) {
  const onSelect = vi.fn();
  render(
    <AvailabilityGrid availability={availability} selected={selected} onSelect={onSelect} />,
  );
  return { onSelect };
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
});

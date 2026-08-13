import { formatPence } from '@/lib/money';
import type { DayAvailability, Slot } from '../types';
import { GridLegend } from './GridLegend';
import { SlotCell } from './SlotCell';

interface AvailabilityGridProps {
  availability: DayAvailability;
  selected: { tableId: number; startAt: string } | null;
  onSelect: (tableId: number, slot: Slot) => void;
}

const DAY_MESSAGE: Record<string, string> = {
  CLUB_CLOSED: 'The club is closed on this day.',
  PAST: 'This date has already passed.',
  TOO_FAR_IN_ADVANCE: 'This date is too far ahead to book yet.',
};

export function AvailabilityGrid({ availability, selected, onSelect }: AvailabilityGridProps) {
  if (!availability.clubOpen || availability.tables.length === 0) {
    const reason = availability.dayUnavailableReason;
    // "This date has already passed" is wrong for today after the last slot has gone: the
    // date has not passed, the day's trading has. The club being open is what separates them.
    const message =
      reason === 'PAST' && availability.clubOpen
        ? 'There are no more slots today.'
        : ((reason && DAY_MESSAGE[reason]) ?? 'No tables are available on this date.');
    return (
      <div
        role="status"
        className="rounded-card border border-dashed border-ink-300 bg-ink-50 p-10 text-center"
      >
        <p className="font-medium text-ink-700">{message}</p>
        <p className="mt-1 text-sm text-ink-500">Try another date.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <GridLegend />

      {/* Horizontal scroll lives on this wrapper so the page body never scrolls
          sideways on a phone. */}
      <div className="overflow-x-auto rounded-card border border-ink-200 bg-white p-4 shadow-card">
        <table className="w-full border-separate border-spacing-1">
          <caption className="sr-only">
            Table availability for {availability.date}, times in {availability.timezone}
          </caption>
          <thead>
            <tr>
              {/* z-30: the corner sits where the sticky row and sticky column cross, so it
                  must outrank both or a scrolling time slides over it. */}
              <th
                scope="col"
                className="sticky left-0 top-0 z-30 bg-white pr-2 text-left shadow-[4px_0_0_0_white]"
              >
                <span className="sr-only">Table</span>
              </th>
              {availability.slotTimes.map((time) => (
                <th
                  key={time}
                  scope="col"
                  // Sticky vertically so the time axis survives scrolling down a tall grid.
                  className="sticky top-0 z-10 min-w-14 bg-white pb-1 text-center text-xs font-normal tabular-nums text-ink-500"
                >
                  {time.slice(0, 5)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {availability.tables.map((table) => (
              <tr key={table.tableId}>
                {/* z-20 beats the sticky time headers' z-10 so a table name is never
                    overprinted. The white box-shadow paints the 4px `border-spacing` gutter
                    to this cell's right: without it that gutter stays transparent and slot
                    times scroll visibly through the seam beside the table column. */}
                <th
                  scope="row"
                  className="sticky left-0 z-20 min-w-32 bg-white pr-3 text-left align-middle shadow-[4px_0_0_0_white]"
                >
                  <span className="block text-sm font-medium text-felt-900">
                    {table.tableName}
                  </span>
                  {/* A range when the rate changes during the day. One figure would be a
                      quote the club does not honour after the rule's window ends. */}
                  <span className="block text-xs text-ink-500">
                    {table.varyingRate
                      ? `${formatPence(table.hourlyRatePence)}–${formatPence(table.highestHourlyRatePence)}/hr`
                      : `${formatPence(table.hourlyRatePence)}/hr`}
                    {!table.tableActive && ' · out of service'}
                  </span>
                </th>
                {table.slots.map((slot) => (
                  <td key={slot.startAt} className="p-0">
                    <SlotCell
                      slot={slot}
                      isSelected={
                        selected?.tableId === table.tableId && selected.startAt === slot.startAt
                      }
                      onSelect={(picked) => onSelect(table.tableId, picked)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

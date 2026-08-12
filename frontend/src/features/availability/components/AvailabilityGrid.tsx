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
    return (
      <div
        role="status"
        className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center"
      >
        <p className="text-sm font-medium text-gray-700">
          {(reason && DAY_MESSAGE[reason]) ?? 'No tables are available on this date.'}
        </p>
        <p className="mt-1 text-xs text-gray-500">Try another date.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <GridLegend />

      {/* Horizontal scroll lives on this wrapper so the page body never scrolls
          sideways on a phone. */}
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-1">
          <caption className="sr-only">
            Table availability for {availability.date}, times in {availability.timezone}
          </caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-white pr-2 text-left">
                <span className="sr-only">Table</span>
              </th>
              {availability.slotTimes.map((time) => (
                <th
                  key={time}
                  scope="col"
                  className="min-w-14 pb-1 text-center text-xs font-normal text-gray-500"
                >
                  {time.slice(0, 5)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {availability.tables.map((table) => (
              <tr key={table.tableId}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 min-w-32 bg-white pr-3 text-left align-middle"
                >
                  <span className="block text-sm font-medium text-gray-900">
                    {table.tableName}
                  </span>
                  <span className="block text-xs text-gray-500">
                    {formatPence(table.hourlyRatePence)}/hr
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

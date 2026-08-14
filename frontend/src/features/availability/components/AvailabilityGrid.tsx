import { addMinutesToTime, formatSlotTime } from '@/lib/datetime';
import { formatPence } from '@/lib/money';
import type { SpanPosition } from '../slotAppearance';
import type { DayAvailability, Slot, TableAvailability, TableType } from '../types';
import { GridLegend } from './GridLegend';
import { SlotCell } from './SlotCell';

interface AvailabilityGridProps {
  availability: DayAvailability;
  selected: { tableId: number; startAt: string } | null;
  /** How long the customer asked for. Null means "any", where there is no run to draw. */
  durationMinutes?: number | null;
  /** Resolves a type code to the club's own label. Omitted where the caller has no types loaded. */
  typeLabel?: (code: TableType) => string;
  onSelect: (tableId: number, slot: Slot) => void;
}

const DAY_MESSAGE: Record<string, string> = {
  CLUB_CLOSED: 'The club is closed on this day.',
  PAST: 'This date has already passed.',
  TOO_FAR_IN_ADVANCE: 'This date is too far ahead to book yet.',
};

/**
 * Which cells the current selection covers, keyed by slot start.
 *
 * <p>Everything needed is already on the wire — the chosen start, the requested duration and the
 * day's increment — so this needs no API change.
 *
 * <p>The run stops at the first cell that is not free, so the bar never paints through time the
 * club has already sold. It deliberately does NOT consult `bookableForRequestedDuration`: that
 * answers "could a booking of the requested length START here", which is false for every cell
 * near closing time and for the tail of any run — the last two hours before close cannot start a
 * two-hour booking, but they are exactly the hours a two-hour booking occupies. Reading it here
 * truncated the bar to its first cell whenever the selection ran towards the end of the day.
 */
function spanFor(
  table: TableAvailability,
  selected: { tableId: number; startAt: string } | null,
  durationMinutes: number | null | undefined,
  incrementMinutes: number,
): Map<string, SpanPosition> {
  const span = new Map<string, SpanPosition>();
  if (!selected || selected.tableId !== table.tableId) {
    return span;
  }

  const startIndex = table.slots.findIndex((slot) => slot.startAt === selected.startAt);
  if (startIndex < 0) {
    return span;
  }

  // Without a duration there is nothing to span: highlight the anchor alone.
  if (!durationMinutes || incrementMinutes <= 0) {
    span.set(table.slots[startIndex]!.startAt, 'only');
    return span;
  }

  const wanted = Math.ceil(durationMinutes / incrementMinutes);
  const covered: Slot[] = [];
  for (let index = startIndex; index < table.slots.length && covered.length < wanted; index++) {
    const slot = table.slots[index]!;
    // Only "is this time free". The start cell's own bookability is the server's verdict on the
    // whole booking and is handled by slotAppearance.
    if (index > startIndex && !slot.available) {
      break;
    }
    covered.push(slot);
  }

  covered.forEach((slot, index) => {
    const position: SpanPosition =
      covered.length === 1
        ? 'only'
        : index === 0
          ? 'start'
          : index === covered.length - 1
            ? 'end'
            : 'middle';
    span.set(slot.startAt, position);
  });
  return span;
}

export function AvailabilityGrid({
  availability,
  selected,
  durationMinutes,
  typeLabel,
  onSelect,
}: AvailabilityGridProps) {
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
        className="rounded-card border border-dashed border-ink-300 bg-surface-sunken p-10 text-center"
      >
        <p className="font-medium text-ink-700">{message}</p>
        <p className="mt-1 text-sm text-ink-500">Try another date.</p>
      </div>
    );
  }

  // The label for the whole booking, said once and reused on every cell in the run.
  const selectedSlot = selected
    ? availability.tables
        .find((table) => table.tableId === selected.tableId)
        ?.slots.find((slot) => slot.startAt === selected.startAt)
    : undefined;
  const spanEndTime =
    selectedSlot && durationMinutes
      ? addMinutesToTime(selectedSlot.startTime, durationMinutes)
      : undefined;
  const spanLabel =
    selectedSlot && spanEndTime
      ? `${formatSlotTime(selectedSlot.startTime)} to ${spanEndTime}`
      : undefined;

  return (
    <div className="space-y-4">
      <GridLegend />

      {/*
        Two elements, and they have to stay two. The card's padding is on the OUTER one and the
        scrolling happens on the inner: `position: sticky; left: 0` pins to the scroll
        container's padding box, so padding on the scroller itself leaves an uncovered strip
        down the left that the time axis scrolls through — the same "times behind the table
        column" defect in a different guise, and one that only appears once the grid is wide
        enough to scroll.
      */}
      {/*
        `w-fit max-w-full`: the card shrinks to the grid on a quiet evening rather than leaving
        a wide empty band to the right of six columns, and still fills the page — scrolling
        inside itself — on a full trading day.
      */}
      <div className="w-fit max-w-full rounded-card border border-line bg-surface p-4 shadow-card">
        <div className="overflow-x-auto">
          {/*
            border-collapse, not border-separate with a gutter.

            The old grid used `border-spacing-1`, which leaves a 4px TRANSPARENT gap between every
            cell. Two visible defects came out of that: slot times scrolled through the gap beside
            the sticky table column, and the selected cell's offset ring drew into it and read as a
            stray line. Both were being patched with `shadow-[4px_0_0_0_white]` hacks painting over
            the gutter. Removing the gutter removes the cause of both — and is what lets a
            multi-cell selection render as one continuous bar instead of separated blocks.
          */}
          {/*
            `w-auto`, not `w-full`. With `w-full` the table stretched to fill the card, so the
            cell width was a function of how many columns there happened to be: a full trading
            day gave 64px cells, while late in the evening — six slots left — the same cells
            ballooned to 130px. A half-hour is a half-hour, and it should occupy the same space
            whatever time it is; the grid reading as a timeline depends on that.
          */}
          {/*
            `table-fixed` is what makes the widths below binding. Under auto layout the browser
            treats a column width as a suggestion and redistributes to fit the available space,
            which is how a full day was squeezed to 38px cells — too narrow for "22:30" — while
            a quiet evening stretched to 130px.
          */}
          <table className="w-max table-fixed border-collapse">
            <caption className="sr-only">
              Table availability for {availability.date}, times in {availability.timezone}
            </caption>
            <thead>
              <tr>
                {/* z-30: the corner sits where the sticky row and sticky column cross, so it
                    must outrank both or a scrolling time slides over it. */}
                <th
                  scope="col"
                  className="sticky left-0 top-0 z-30 bg-surface pb-2 pr-3 text-left shadow-[inset_-1px_0_0_var(--color-line)]"
                >
                  <span className="sr-only">Table</span>
                </th>
                {availability.slotTimes.map((time) => (
                  <th
                    key={time}
                    scope="col"
                    // Sticky vertically so the time axis survives scrolling down a tall grid.
                    // w-16, not min-w-16: a fixed width is what keeps a half-hour the same
                    // size on a quiet evening as on a full day.
                    className="sticky top-0 z-10 w-16 bg-surface px-0.5 pb-2 text-center text-xs font-normal tabular-nums text-ink-500"
                  >
                    {time.slice(0, 5)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {availability.tables.map((table) => {
                const span = spanFor(table, selected, durationMinutes, availability.incrementMinutes);
                return (
                  <tr key={table.tableId}>
                    {/* z-20 beats the sticky time headers' z-10 so a table name is never
                        overprinted. The inset shadow draws the column's right edge as part of the
                        cell, so it travels with it instead of leaving a seam to scroll through. */}
                    <th
                      scope="row"
                      className="sticky left-0 z-20 w-44 min-w-44 bg-surface py-1 pr-3 text-left align-middle shadow-[inset_-1px_0_0_var(--color-line)]"
                    >
                      <span className="block text-sm font-medium text-felt-900">
                        {table.tableName}
                      </span>
                      {/* The type, which the row never showed: "Table 3" and "Match Table" say
                          nothing about what you can play on them. */}
                      {typeLabel && (
                        <span className="block text-xs text-fg-muted">
                          {typeLabel(table.tableType)}
                        </span>
                      )}
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
                      // px-0 py-px: the cells butt together horizontally so a selected run reads
                      // as one bar, with a hairline between rows so the rows stay distinct.
                      <td key={slot.startAt} className="px-0 py-px">
                        <SlotCell
                          slot={slot}
                          span={span.get(slot.startAt) ?? null}
                          spanLabel={spanLabel}
                          spanEndTime={spanEndTime}
                          onSelect={(picked) => onSelect(table.tableId, picked)}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
              </tbody>
            </table>
        </div>
      </div>
    </div>
  );
}

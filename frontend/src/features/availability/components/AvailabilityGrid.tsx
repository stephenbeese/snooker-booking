import { useEffect, useRef } from 'react';
import { addMinutesToTime, formatSlotTime } from '@/lib/datetime';
import { formatPence } from '@/lib/money';
import { durationForRange } from '../rangeSelection';
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
  /**
   * A range gesture resolved to a start and a permitted duration — a second click on the row,
   * or the release of a drag.
   *
   * <p>Separate from `onSelect` because it changes the requested duration as well as the
   * selection, and only the page owns that. Omitted by callers that have no duration control
   * to drive, where the grid falls back to plain single-cell picking.
   */
  onSelectRange?: ((tableId: number, slot: Slot, durationMinutes: number) => void) | undefined;
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
  onSelectRange,
}: AvailabilityGridProps) {
  // Where a drag began, and whether it has actually moved. A press that never leaves its cell
  // is a click, not a one-cell drag — without `moved` every ordinary click would also fire a
  // range for the minimum duration and quietly overwrite the customer's chosen length.
  //
  // A ref, not state: nothing renders from this. What the grid draws during a drag comes from
  // the `selected`/`durationMinutes` props the gesture pushes up to the page, so holding it in
  // state would re-render the whole grid on every pointerdown and produce no pixel that the
  // props were not already going to produce.
  const dragRef = useRef<{ tableId: number; startAt: string; moved: boolean } | null>(null);

  // The drag has to end even when the pointer is released off the grid — over the summary bar,
  // outside the window, anywhere. Without this a released drag stays armed, and the next
  // hover over the grid extends a selection nobody is dragging.
  useEffect(() => {
    function end() {
      dragRef.current = null;
    }
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, []);

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

  // "23:00:00" -> "23:00". Null on a day with no published closing time, where there is
  // nothing truthful to draw and the column is dropped entirely.
  const closingTime = availability.closingTime ? formatSlotTime(availability.closingTime) : null;

  /**
   * A range gesture, from either input path.
   *
   * <p>Both the second click and the drag release land here, so the two can never resolve the
   * same pair of cells to different durations. Returns whether it was taken, which is how the
   * click handler decides between extending an existing selection and starting a new one.
   */
  function extendTo(table: TableAvailability, anchorStartAt: string, target: Slot): boolean {
    if (!onSelectRange) {
      return false;
    }
    const minutes = durationForRange(
      table,
      anchorStartAt,
      target.startAt,
      availability.durationOptions,
      availability.incrementMinutes,
    );
    if (minutes === null) {
      return false;
    }
    const anchor = table.slots.find((slot) => slot.startAt === anchorStartAt);
    if (!anchor) {
      return false;
    }
    onSelectRange(table.tableId, anchor, minutes);
    return true;
  }

  function handleClick(table: TableAvailability, slot: Slot) {
    // A second click in the row that already holds the selection sets the END of the booking.
    // Clicking the anchor itself, or anywhere before it, falls through to re-anchoring — so
    // clicking back up the row picks a new start time rather than refusing the click.
    if (
      selected &&
      selected.tableId === table.tableId &&
      slot.startAt !== selected.startAt &&
      extendTo(table, selected.startAt, slot)
    ) {
      return;
    }
    onSelect(table.tableId, slot);
  }

  return (
    <div className="space-y-4">
      <GridLegend closingTime={closingTime} />

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
            {/* The closing time belongs here too: the hatched column is `aria-hidden`, so
                without it a screen-reader user gets no equivalent for "the club shuts at". */}
            <caption className="sr-only">
              Table availability for {availability.date}, times in {availability.timezone}
              {closingTime && `. The club closes at ${closingTime}.`}
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
                {/* The closing time, as the axis's last label. The grid simply stopped before,
                    so the final column read as "the data ran out" rather than "the club
                    shuts" — and the last cell's own start time (22:30) is not the closing
                    time (23:00), which made the end of the day look half an hour early. */}
                {closingTime && (
                  <th
                    scope="col"
                    className="sticky top-0 z-10 w-16 bg-surface px-0.5 pb-2 text-center text-xs font-medium tabular-nums text-ink-600"
                  >
                    {closingTime}
                  </th>
                )}
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
                          onSelect={(picked) => handleClick(table, picked)}
                          onExtendStart={
                            onSelectRange
                              ? (picked) => {
                                  // Only ARM the drag. Anchoring here would break click-then-
                                  // click: pointerdown precedes click, so pressing the end
                                  // cell would re-anchor the selection onto it and destroy
                                  // the very start time the click was about to extend from.
                                  // The anchor is set on first movement instead, which is the
                                  // point where the gesture is known to be a drag.
                                  dragRef.current = {
                                    tableId: table.tableId,
                                    startAt: picked.startAt,
                                    moved: false,
                                  };
                                }
                              : undefined
                          }
                          onExtendTo={
                            onSelectRange
                              ? (picked) => {
                                  const active = dragRef.current;
                                  if (!active || active.tableId !== table.tableId) {
                                    return;
                                  }
                                  if (picked.startAt === active.startAt) {
                                    return;
                                  }
                                  // First movement: the press was a drag after all, so commit
                                  // its origin as the anchor before extending to here.
                                  if (!active.moved) {
                                    dragRef.current = { ...active, moved: true };
                                    const origin = table.slots.find(
                                      (slot) => slot.startAt === active.startAt,
                                    );
                                    if (origin) {
                                      onSelect(table.tableId, origin);
                                    }
                                  }
                                  // Anchored on `active.startAt`, not on the `selected` prop:
                                  // the anchoring `onSelect` above is in the same handler, so
                                  // the prop still holds the previous value on this pass.
                                  extendTo(table, active.startAt, picked);
                                }
                              : undefined
                          }
                        />
                      </td>
                    ))}
                    {/* A hatched stub closing every row, so "the club is shut from here" is
                        drawn rather than merely implied by the grid ending. Repeated per row
                        rather than drawn once, because a table cell cannot span rows without
                        breaking the sticky column's geometry. */}
                    {closingTime && (
                      <td className="px-0 py-px">
                        <div
                          aria-hidden
                          className="h-10 w-full rounded-r-lg border-l-2 border-ink-300 bg-[repeating-linear-gradient(135deg,var(--color-ink-100)_0px,var(--color-ink-100)_4px,transparent_4px,transparent_8px)]"
                        />
                      </td>
                    )}
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

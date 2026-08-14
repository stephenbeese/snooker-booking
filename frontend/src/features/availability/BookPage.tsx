import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { PageShell } from '@/components/ui/PageShell';
import { Panel } from '@/components/ui/Panel';
import { Skeleton } from '@/components/ui/Skeleton';
import { useCurrentUser } from '@/features/auth/useAuth';
import { useCreateBooking } from '@/features/booking/useBookings';
import { useClub } from '@/features/club/useClub';
import { ApiError } from '@/lib/apiError';
import {
  addMinutesToTime,
  formatDateLong,
  formatDuration,
  formatSlotTime,
  todayIso,
} from '@/lib/datetime';
import { formatPence } from '@/lib/money';
import { AvailabilityGrid } from './components/AvailabilityGrid';
import { DateSelector } from './components/DateSelector';
import { DurationPicker } from './components/DurationPicker';
import { TableTypeFilter } from './components/TableTypeFilter';
import type { Slot } from './types';
import { useAvailability, useTableTypeLabel } from './useAvailability';

/**
 * Which cell is picked — the identity only.
 *
 * <p>Deliberately not a snapshot of the slot's name, price or times. Those all change when
 * the requested duration changes, and a copy taken at click time silently goes stale: the
 * summary would quote the old duration's price for a booking the server then rejects.
 * Everything displayed is looked up from the live grid on each render instead.
 */
interface Selection {
  tableId: number;
  startAt: string;
}

export function BookPage() {
  const [date, setDate] = useState(todayIso);
  const [durationMinutes, setDurationMinutes] = useState<number | null>(60);
  const [selected, setSelected] = useState<Selection | null>(null);

  const { data, isPending, isError, error, isPlaceholderData, refetch } = useAvailability({
    date,
    durationMinutes: durationMinutes ?? undefined,
  });

  const { data: user } = useCurrentUser();
  // For the date picker's upper bound. The club publishes the window it actually sells; a
  // number hardcoded here would disagree the moment an admin changed it.
  const { data: club } = useClub();
  const typeLabel = useTableTypeLabel();
  const createBooking = useCreateBooking();
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [droppedReason, setDroppedReason] = useState<string | null>(null);

  // The type filter lives in the URL so a refresh, a back button or a shared link keeps it.
  // It is applied here rather than by refetching with `tableId`: the server would return the
  // same slots either way, and a round trip per chip tap would blank the grid for no gain.
  const [searchParams, setSearchParams] = useSearchParams();
  const tableType = searchParams.get('type');

  const visibleTables = data?.tables.filter(
    (table) => tableType === null || table.tableType === tableType,
  );
  const filteredAvailability =
    data && visibleTables ? { ...data, tables: visibleTables } : undefined;

  // Resolved from the freshest grid, so a duration change re-derives the price, the end time
  // and whether the slot is still bookable at all.
  const selectedTable = selected
    ? data?.tables.find((table) => table.tableId === selected.tableId)
    : undefined;
  const selectedSlot = selected
    ? selectedTable?.slots.find((slot) => slot.startAt === selected.startAt)
    : undefined;

  // The server decides whether the selection still fits, not a rule reimplemented here — the
  // two could otherwise disagree, and the server is the one that rejects the booking.
  // `isPlaceholderData` gates this: during a refetch the grid still holds the *previous*
  // duration's answer, and acting on it would drop a selection that is actually fine.
  const staleSelection =
    selected !== undefined &&
    selected !== null &&
    data !== undefined &&
    !isPlaceholderData &&
    (selectedSlot === undefined || selectedSlot.bookableForRequestedDuration === false);

  useEffect(() => {
    if (!staleSelection) {
      return;
    }
    const fits = selectedSlot?.maxDurationMinutes ?? 0;
    setSelected(null);
    setDroppedReason(
      fits > 0
        ? `That start time only fits ${formatDuration(fits)}, so the selection was cleared.`
        : 'That slot is no longer available for the chosen duration, so the selection was cleared.',
    );
  }, [staleSelection, selectedSlot]);

  async function handleBook() {
    if (!selected || durationMinutes === null || !selectedSlot) {
      return;
    }
    setBookingError(null);
    try {
      const response = await createBooking.mutateAsync({
        tableId: selected.tableId,
        date,
        startTime: selectedSlot.startTime,
        durationMinutes,
      });
      // A full navigation, not a router push: Checkout is hosted on Stripe's origin.
      window.location.assign(response.checkoutUrl);
    } catch (caught) {
      if (caught instanceof ApiError && caught.isSlotUnavailable) {
        // Somebody else took it between rendering the grid and this click. Refetching is the
        // useful response — a stale grid would let them lose the race repeatedly.
        setBookingError('That slot has just been taken. The grid has been refreshed.');
        setSelected(null);
        await refetch();
        return;
      }
      setBookingError(
        caught instanceof ApiError ? caught.message : 'Could not create the booking.',
      );
    }
  }

  /**
   * A single click: this is the START of a booking, held at the shortest length the club sells
   * until a second click says otherwise.
   *
   * <p>The duration is not carried over from the previous booking — that would pre-answer a
   * question the customer has not been asked and draw a span they never chose. It drops to the
   * minimum instead of to "Any" so that one click is already a complete, priced, bookable
   * thing: somebody who only wants half an hour is finished, and everybody else drags or
   * clicks an end time to lengthen it.
   *
   * <p>The minimum comes from the server's own `durationOptions` rather than a hardcoded 30,
   * since the increment is a club setting an admin can change.
   *
   * <p>There is no clamping here any more. Clamping existed to shorten a booking whose
   * requested length did not fit at the clicked cell; the end click resolves the length now,
   * and `durationForRange` already refuses to run a range past anything unsold.
   */
  function handleSelect(tableId: number, slot: Slot) {
    // A fresh choice invalidates whatever the last attempt said.
    setBookingError(null);
    setDroppedReason(null);

    // Clicking the cell that is already the start of the booking clears it. Without this the
    // only way out of a selection is to pick a different one, so a misclick cannot be undone —
    // and the pinned summary bar stays on screen offering to charge for it.
    if (selected && selected.tableId === tableId && selected.startAt === slot.startAt) {
      setSelected(null);
      return;
    }

    const shortest = data?.durationOptions[0]?.minutes ?? null;
    setDurationMinutes(shortest);
    setSelected({ tableId, startAt: slot.startAt });
  }

  /**
   * A start and an end picked on the grid — two clicks, or a drag.
   *
   * <p>The duration arrives already snapped to one the club sells; the grid resolves that, so
   * this only has to trust it and set both halves at once.
   */
  function handleSelectRange(tableId: number, slot: Slot, minutes: number) {
    setBookingError(null);
    setDroppedReason(null);
    setDurationMinutes(minutes);
    setSelected({ tableId, startAt: slot.startAt });
  }

  function changeDate(next: string) {
    setDate(next);
    // The selection refers to a slot on the old date, so it cannot survive.
    setSelected(null);
    setBookingError(null);
    setDroppedReason(null);
  }

  function changeDuration(next: number | null) {
    setDurationMinutes(next);
    // Stale the moment the requested length changes: it was raised against the old duration.
    setBookingError(null);
    setDroppedReason(null);
  }

  function changeTableType(next: string | null) {
    setSearchParams(
      (params) => {
        if (next === null) {
          params.delete('type');
        } else {
          params.set('type', next);
        }
        return params;
      },
      // Filtering is not a place in history: without this, leaving the page would mean pressing
      // back once per chip tapped on the way in.
      { replace: true },
    );
    setBookingError(null);
    setDroppedReason(null);

    // A selection on a table the filter just hid would stay live and bookable while invisible,
    // leaving the summary bar quoting a table not on screen.
    if (selected && next !== null && selectedTable && selectedTable.tableType !== next) {
      setSelected(null);
      setDroppedReason(
        `${selectedTable.tableName} is hidden by the ${typeLabel(next)} filter, so your selection was cleared.`,
      );
    }
  }

  return (
    <PageShell title="Book a table" description="Choose a date, then pick a table and start time.">
      <Panel className="mt-8" flush>
        <div className="flex flex-wrap items-center gap-4 p-4">
          <DateSelector date={date} maxAdvanceDays={club?.maxAdvanceDays} onChange={changeDate} />
          {data && (
            <DurationPicker
              options={data.durationOptions}
              value={durationMinutes}
              onChange={changeDuration}
            />
          )}
        </div>
        {/* Derived from the day's own tables, and renders nothing when the club has only one
            kind — see TableTypeFilter. */}
        {data && data.tables.length > 0 && (
          <div className="border-t border-line p-4">
            <TableTypeFilter
              tables={data.tables}
              value={tableType}
              onChange={changeTableType}
              label={typeLabel}
            />
          </div>
        )}
      </Panel>

      {/* Outside the selection panel below, which only renders while something is selected.
          A message explaining why the selection was cleared cannot live inside the thing it
          is explaining the absence of. */}
      {(droppedReason || (bookingError && !selected)) && (
        <Alert tone="warning" className="mt-4">
          {droppedReason ?? bookingError}
        </Alert>
      )}

      <section className="mt-6" aria-live="polite" aria-busy={isPending}>
        {isPending && <Skeleton className="h-11" count={6} label="Loading availability" />}

        {isError && (
          <Alert tone="danger">
            <span className="font-medium">Could not load availability</span>
            <span className="mt-1 block">{error.message}</span>
          </Alert>
        )}

        {filteredAvailability && (
          <div className={isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
            <AvailabilityGrid
              availability={filteredAvailability}
              selected={selected ? { tableId: selected.tableId, startAt: selected.startAt } : null}
              durationMinutes={durationMinutes}
              typeLabel={typeLabel}
              onSelect={handleSelect}
              onSelectRange={handleSelectRange}
            />
          </div>
        )}
      </section>

      {selected && selectedTable && selectedSlot && (
        // Pinned to the bottom of the viewport: the grid is tall, and a summary that scrolls
        // away takes the "Book and pay" button with it.
        //
        // `bottom-0` with its own background band, not `bottom-4` floating over the page. At
        // bottom-4 the grid showed through the gap beneath it and around its rounded corners,
        // so the panel read as sitting *on* the table rather than in front of it. z-30 keeps
        // it above the grid's sticky column, which is z-20.
        <aside className="sticky bottom-0 z-30 -mx-4 mt-6 border-t border-felt-200 bg-felt-50 p-5 shadow-lifted sm:-mx-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xs font-medium uppercase tracking-wide text-felt-700">
                Your selection
              </h2>
              {/* A labelled list rather than one run-on line. Every fact a customer is about
                  to pay for — which table, which day, what time, how long, how much — is
                  named, so nothing has to be inferred from position or a separator dot. */}
              <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
                <SelectionFact label="Table" value={selectedTable.tableName} />
                <SelectionFact label="Date" value={formatDateLong(date)} />
                <SelectionFact
                  label="Time"
                  value={
                    durationMinutes === null
                      ? formatSlotTime(selectedSlot.startTime)
                      : `${formatSlotTime(selectedSlot.startTime)}–${addMinutesToTime(
                          selectedSlot.startTime,
                          durationMinutes,
                        )}`
                  }
                />
                {durationMinutes !== null && (
                  <SelectionFact label="Duration" value={formatDuration(durationMinutes)} />
                )}
                {selectedSlot.pricePenceForRequestedDuration !== null && (
                  // The one figure they are about to be charged, so it does not read at the
                  // same weight as the day of the week.
                  <SelectionFact
                    label="Total"
                    value={formatPence(selectedSlot.pricePenceForRequestedDuration)}
                    emphasis
                  />
                )}
              </dl>
            </div>

            {user ? (
              <div className="text-right">
                <Button
                  size="lg"
                  onClick={handleBook}
                  disabled={createBooking.isPending || durationMinutes === null}
                >
                  {createBooking.isPending ? 'Reserving your table…' : 'Book and pay'}
                </Button>
                {/* A disabled button with no explanation reads as a broken page. */}
                {durationMinutes === null && (
                  <p className="mt-1.5 text-xs text-felt-800">Choose a duration to book.</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-felt-900">
                <Link
                  to="/login"
                  state={{ from: '/book' }}
                  className="font-medium text-felt-700 underline underline-offset-2"
                >
                  Sign in
                </Link>{' '}
                or{' '}
                <Link
                  to="/register"
                  className="font-medium text-felt-700 underline underline-offset-2"
                >
                  create an account
                </Link>{' '}
                to book this slot.
              </p>
            )}
          </div>

          {/* Only while a selection survives. When the booking failed because the slot was
              taken, the selection is cleared and the message is rendered above the grid
              instead — here it would unmount with the panel and never be read. */}
          {bookingError && selected && (
            <Alert tone="danger" className="mt-4 bg-surface">
              {bookingError}
            </Alert>
          )}
        </aside>
      )}
    </PageShell>
  );
}

/** One labelled fact in the selection summary. */
function SelectionFact({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-felt-700">{label}</dt>
      <dd
        className={[
          'mt-0.5 font-semibold tracking-tight text-felt-900',
          emphasis ? 'text-xl' : 'text-base',
        ].join(' ')}
      >
        {value}
      </dd>
    </div>
  );
}

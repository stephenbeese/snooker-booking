import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
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
import type { Slot } from './types';
import { useAvailability } from './useAvailability';

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
  const createBooking = useCreateBooking();
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [droppedReason, setDroppedReason] = useState<string | null>(null);

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

  function handleSelect(tableId: number, slot: Slot) {
    // A fresh choice invalidates whatever the last attempt said.
    setBookingError(null);
    setDroppedReason(null);
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

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-felt-900">Book a table</h1>
        <p className="mt-2 text-ink-600">Choose a date, then pick a table and start time.</p>
      </header>

      <div className="mt-8 flex flex-wrap items-center gap-4 rounded-card border border-ink-200 bg-white p-4 shadow-card">
        <DateSelector
          date={date}
          maxAdvanceDays={club?.maxAdvanceDays}
          onChange={changeDate}
        />
        {data && (
          <DurationPicker
            options={data.durationOptions}
            value={durationMinutes}
            onChange={changeDuration}
          />
        )}
      </div>

      {/* Outside the selection panel below, which only renders while something is selected.
          A message explaining why the selection was cleared cannot live inside the thing it
          is explaining the absence of. */}
      {(droppedReason || (bookingError && !selected)) && (
        <div
          role="alert"
          className="mt-4 rounded-card border border-amber-200 bg-amber-50 p-3"
        >
          <p className="text-sm text-amber-900">{droppedReason ?? bookingError}</p>
        </div>
      )}

      <section className="mt-6" aria-live="polite" aria-busy={isPending}>
        {isPending && (
          <div className="space-y-2">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="h-11 animate-pulse rounded-lg bg-ink-100" />
            ))}
          </div>
        )}

        {isError && (
          <div role="alert" className="rounded-card border border-rose-200 bg-rose-50 p-4">
            <p className="text-sm font-medium text-rose-800">Could not load availability</p>
            <p className="mt-1 text-sm text-rose-700">{error.message}</p>
          </div>
        )}

        {data && (
          <div className={isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
            <AvailabilityGrid
              availability={data}
              selected={selected ? { tableId: selected.tableId, startAt: selected.startAt } : null}
              onSelect={handleSelect}
            />
          </div>
        )}
      </section>

      {selected && selectedTable && selectedSlot && (
        // Sticky at the bottom of the viewport on a phone: the grid is tall, and a summary
        // that scrolls away takes the "Book and pay" button with it.
        <aside className="sticky bottom-4 mt-6 rounded-card border border-felt-200 bg-felt-50 p-5 shadow-lifted">
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
                  <SelectionFact
                    label="Total"
                    value={formatPence(selectedSlot.pricePenceForRequestedDuration)}
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
            <div role="alert" className="mt-4 rounded-lg border border-rose-200 bg-white p-3">
              <p className="text-sm text-rose-800">{bookingError}</p>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}

/** One labelled fact in the selection summary. */
function SelectionFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-felt-700">{label}</dt>
      <dd className="mt-0.5 text-base font-semibold tracking-tight text-felt-900">{value}</dd>
    </div>
  );
}

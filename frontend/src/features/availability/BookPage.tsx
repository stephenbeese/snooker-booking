import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { useCurrentUser } from '@/features/auth/useAuth';
import { useCreateBooking } from '@/features/booking/useBookings';
import { ApiError } from '@/lib/apiError';
import { formatSlotTime, todayIso } from '@/lib/datetime';
import { formatPence } from '@/lib/money';
import { AvailabilityGrid } from './components/AvailabilityGrid';
import { DateSelector } from './components/DateSelector';
import { DurationPicker } from './components/DurationPicker';
import type { Slot } from './types';
import { useAvailability } from './useAvailability';

interface Selection {
  tableId: number;
  tableName: string;
  startAt: string;
  startTime: string;
  pricePence: number | null;
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
  const createBooking = useCreateBooking();
  const [bookingError, setBookingError] = useState<string | null>(null);

  async function handleBook() {
    if (!selected || durationMinutes === null) {
      return;
    }
    setBookingError(null);
    try {
      const response = await createBooking.mutateAsync({
        tableId: selected.tableId,
        date,
        startTime: selected.startTime,
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
    const table = data?.tables.find((candidate) => candidate.tableId === tableId);
    if (!table) {
      return;
    }
    setSelected({
      tableId,
      tableName: table.tableName,
      startAt: slot.startAt,
      startTime: slot.startTime,
      pricePence: slot.pricePenceForRequestedDuration,
    });
  }

  function changeDate(next: string) {
    setDate(next);
    // The selection refers to a slot on the old date, so it cannot survive.
    setSelected(null);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-felt-900">Book a table</h1>
        <p className="mt-2 text-ink-600">Choose a date, then pick a table and start time.</p>
      </header>

      <div className="mt-8 flex flex-wrap items-center gap-4 rounded-card border border-ink-200 bg-white p-4 shadow-card">
        <DateSelector date={date} onChange={changeDate} />
        {data && (
          <DurationPicker
            options={data.durationOptions}
            value={durationMinutes}
            onChange={setDurationMinutes}
          />
        )}
      </div>

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

      {selected && (
        // Sticky at the bottom of the viewport on a phone: the grid is tall, and a summary
        // that scrolls away takes the "Book and pay" button with it.
        <aside className="sticky bottom-4 mt-6 rounded-card border border-felt-200 bg-felt-50 p-5 shadow-lifted">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xs font-medium uppercase tracking-wide text-felt-700">
                Your selection
              </h2>
              <p className="mt-1 text-lg font-semibold tracking-tight text-felt-900">
                {selected.tableName} at {formatSlotTime(selected.startTime)}
              </p>
              {selected.pricePence !== null && (
                <p className="mt-0.5 text-sm text-felt-800">{formatPence(selected.pricePence)}</p>
              )}
            </div>

            {user ? (
              <Button
                size="lg"
                onClick={handleBook}
                disabled={createBooking.isPending || durationMinutes === null}
              >
                {createBooking.isPending ? 'Reserving your table…' : 'Book and pay'}
              </Button>
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

          {bookingError && (
            <div role="alert" className="mt-4 rounded-lg border border-rose-200 bg-white p-3">
              <p className="text-sm text-rose-800">{bookingError}</p>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}

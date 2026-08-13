import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { formatSlotTime } from '@/lib/datetime';
import { formatPence } from '@/lib/money';
import { CancelBookingDialog } from './CancelBookingDialog';
import type { Booking, BookingStatus } from './types';
import { useMyBookings } from './useBookings';

const STATUS_STYLE: Record<BookingStatus, string> = {
  CONFIRMED: 'bg-felt-100 text-felt-900',
  PENDING_PAYMENT: 'bg-amber-100 text-amber-900',
  CANCELLED: 'bg-ink-200 text-ink-700',
  EXPIRED: 'bg-ink-200 text-ink-700',
  COMPLETED: 'bg-ink-200 text-ink-700',
  NO_SHOW: 'bg-rose-100 text-rose-900',
};

const STATUS_LABEL: Record<BookingStatus, string> = {
  CONFIRMED: 'Confirmed',
  PENDING_PAYMENT: 'Payment needed',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  COMPLETED: 'Completed',
  NO_SHOW: 'Missed',
};

export function MyBookingsPage() {
  const { data: bookings, isPending, isError, error } = useMyBookings();
  const [cancelling, setCancelling] = useState<Booking | null>(null);

  // Split on the end time rather than the start: a session under way is still "upcoming" to
  // the person sitting at the table, and dropping it into history mid-frame reads as a bug.
  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const all = bookings ?? [];
    return {
      upcoming: all
        .filter((booking) => new Date(booking.endAt).getTime() >= now)
        // The list arrives newest-first, which is right for history and backwards for
        // what's coming up — soonest first is what someone checking "when am I playing?" wants.
        .sort((a, b) => a.startAt.localeCompare(b.startAt)),
      past: all.filter((booking) => new Date(booking.endAt).getTime() < now),
    };
  }, [bookings]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight text-felt-900">My bookings</h1>
        <Link
          to="/book"
          className="rounded-xl bg-felt-700 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-felt-800"
        >
          Book a table
        </Link>
      </div>

      {isPending && (
        <div className="mt-8 space-y-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-card bg-ink-100" />
          ))}
        </div>
      )}

      {isError && (
        <div role="alert" className="mt-8 rounded-card border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm text-rose-800">{error.message}</p>
        </div>
      )}

      {bookings && bookings.length === 0 && (
        <div className="mt-8 rounded-card border border-dashed border-ink-300 bg-ink-50 p-10 text-center">
          <p className="font-medium text-ink-700">You have no bookings yet.</p>
          <Link
            to="/book"
            className="mt-4 inline-flex rounded-xl bg-felt-700 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-felt-800"
          >
            Find a table
          </Link>
        </div>
      )}

      {bookings && bookings.length > 0 && (
        <>
          <Section title="Upcoming" count={upcoming.length} emptyMessage="Nothing booked yet.">
            {upcoming.map((booking) => (
              <BookingCard
                key={booking.reference}
                booking={booking}
                onCancel={() => setCancelling(booking)}
              />
            ))}
          </Section>

          {past.length > 0 && (
            <Section title="Past" count={past.length}>
              {past.map((booking) => (
                <BookingCard key={booking.reference} booking={booking} />
              ))}
            </Section>
          )}
        </>
      )}

      {cancelling && (
        <CancelBookingDialog booking={cancelling} onClose={() => setCancelling(null)} />
      )}
    </div>
  );
}

function Section({
  title,
  count,
  emptyMessage,
  children,
}: {
  title: string;
  count: number;
  emptyMessage?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-sm font-medium uppercase tracking-wide text-ink-500">
        {title}
        <span className="ml-2 text-ink-400">{count}</span>
      </h2>
      {count === 0 ? (
        <p className="mt-3 text-sm text-ink-500">{emptyMessage}</p>
      ) : (
        <ul className="mt-3 space-y-3">{children}</ul>
      )}
    </section>
  );
}

function BookingCard({ booking, onCancel }: { booking: Booking; onCancel?: () => void }) {
  const isPast = new Date(booking.endAt).getTime() < Date.now();

  return (
    <li className="rounded-card border border-ink-200 bg-white p-5 shadow-card transition-shadow hover:shadow-lifted">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to={`/bookings/${booking.reference}`}
            className="font-semibold tracking-tight text-felt-900 hover:underline"
          >
            {booking.tableName}
          </Link>
          <p className="mt-1 text-sm text-ink-600">
            {formatDate(booking.date)} · {formatSlotTime(booking.startTime)}–
            {formatSlotTime(booking.endTime)}
          </p>
          <p className="mt-2 font-mono text-xs text-ink-400">{booking.reference}</p>
        </div>

        <div className="text-right">
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[booking.status]}`}
          >
            {STATUS_LABEL[booking.status]}
          </span>
          <p className="mt-2 font-semibold text-felt-900">{formatPence(booking.pricePence)}</p>
        </div>
      </div>

      {/* Only for bookings still ahead: explaining to someone why last month's game cannot be
          cancelled is noise, not help. */}
      {!isPast && onCancel && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-ink-100 pt-4">
          {booking.cancellable ? (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-50"
            >
              Cancel booking
            </button>
          ) : (
            booking.cancellationBlockedReason && (
              <p className="text-sm text-ink-500">{booking.cancellationBlockedReason}</p>
            )
          )}

          {booking.status === 'PENDING_PAYMENT' && (
            <Link
              to={`/bookings/${booking.reference}`}
              className="ml-auto text-sm font-medium text-felt-700 hover:text-felt-900"
            >
              Complete payment →
            </Link>
          )}
        </div>
      )}
    </li>
  );
}

function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) {
    return isoDate;
  }
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

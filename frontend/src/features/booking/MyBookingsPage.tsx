import { Link } from 'react-router';
import { formatSlotTime } from '@/lib/datetime';
import { formatPence } from '@/lib/money';
import type { Booking, BookingStatus } from './types';
import { useMyBookings } from './useBookings';

const STATUS_STYLE: Record<BookingStatus, string> = {
  CONFIRMED: 'bg-felt-100 text-felt-900',
  PENDING_PAYMENT: 'bg-amber-100 text-amber-900',
  CANCELLED: 'bg-gray-200 text-gray-700',
  EXPIRED: 'bg-gray-200 text-gray-700',
  COMPLETED: 'bg-gray-200 text-gray-700',
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

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-felt-900">My bookings</h1>

      <div className="mt-8">
        {isPending && (
          <div className="space-y-3">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="h-24 animate-pulse rounded-card bg-ink-100" />
            ))}
          </div>
        )}

        {isError && (
          <div role="alert" className="rounded-card border border-rose-200 bg-rose-50 p-4">
            <p className="text-sm text-rose-800">{error.message}</p>
          </div>
        )}

        {bookings && bookings.length === 0 && (
          <div className="rounded-card border border-dashed border-ink-300 bg-ink-50 p-10 text-center">
            <p className="font-medium text-ink-700">You have no bookings yet.</p>
            <Link
              to="/book"
              className="mt-4 inline-flex rounded-xl bg-felt-700 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-felt-800"
            >
              Book a table
            </Link>
          </div>
        )}

        {bookings && bookings.length > 0 && (
          <ul className="space-y-3">
            {bookings.map((booking) => (
              <li key={booking.reference}>
                <BookingCard booking={booking} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function BookingCard({ booking }: { booking: Booking }) {
  return (
    <Link
      to={`/bookings/${booking.reference}`}
      className="block rounded-card border border-ink-200 bg-white p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-felt-300 hover:shadow-lifted"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold tracking-tight text-felt-900">{booking.tableName}</p>
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
    </Link>
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

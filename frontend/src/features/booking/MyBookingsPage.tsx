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
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-felt-900">My bookings</h1>

      <div className="mt-6">
        {isPending && <p className="text-sm text-gray-500">Loading…</p>}

        {isError && (
          <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4">
            <p className="text-sm text-rose-800">{error.message}</p>
          </div>
        )}

        {bookings && bookings.length === 0 && (
          <div className="rounded-lg border border-gray-200 p-6 text-center">
            <p className="text-sm text-gray-600">You have no bookings yet.</p>
            <Link to="/book" className="mt-2 inline-block text-sm font-medium text-felt-700 underline">
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
    </main>
  );
}

function BookingCard({ booking }: { booking: Booking }) {
  return (
    <Link
      to={`/bookings/${booking.reference}`}
      className="block rounded-lg border border-gray-200 p-4 transition-colors hover:border-felt-500"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-felt-900">{booking.tableName}</p>
          <p className="mt-1 text-sm text-gray-600">
            {formatDate(booking.date)} · {formatSlotTime(booking.startTime)}–
            {formatSlotTime(booking.endTime)}
          </p>
        </div>
        <div className="text-right">
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[booking.status]}`}
          >
            {STATUS_LABEL[booking.status]}
          </span>
          <p className="mt-1 text-sm font-medium text-felt-900">{formatPence(booking.pricePence)}</p>
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

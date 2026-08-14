import { Link, useParams } from 'react-router';
import { formatDateLong, formatSlotTime } from '@/lib/datetime';
import { formatPence } from '@/lib/money';
import { PaymentBadge } from './components/PaymentBadge';
import { StatusBadge } from './components/StatusBadge';
import { useAdminCustomer } from './useAdmin';
import type { AdminBooking } from './types';

/**
 * One customer's record: who they are, and every booking they have had.
 *
 * <p>The bookings arrive on the same response as the customer, so this makes one request rather
 * than two. Staff open this to answer "when are they next in" — a page that renders the name
 * first and fetches the bookings afterwards would show a blank where the answer goes.
 */
export function AdminCustomerDetailPage() {
  const { id = '' } = useParams();
  const { data, isPending, isError, error } = useAdminCustomer(Number(id));

  if (isPending) {
    return (
      <Shell>
        <div className="h-64 animate-pulse rounded-card bg-ink-100" />
      </Shell>
    );
  }

  if (isError) {
    return (
      <Shell>
        <div role="alert" className="rounded-card border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm font-medium text-rose-800">Could not load this customer</p>
          <p className="mt-1 text-sm text-rose-700">{error.message}</p>
        </div>
      </Shell>
    );
  }

  const { customer, bookings } = data;
  const upcoming = bookings.filter(isUpcoming);
  const past = bookings.filter((booking) => !isUpcoming(booking));

  return (
    <Shell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-felt-900">
            {customer.fullName}
          </h2>
          <p className="mt-1 text-sm text-ink-600">{customer.email}</p>
          {customer.phone && <p className="text-sm text-ink-600">{customer.phone}</p>}
        </div>
        {!customer.active && (
          <span className="rounded-full bg-ink-100 px-3 py-1 text-xs font-medium text-ink-700">
            Deactivated
          </span>
        )}
      </div>

      <dl className="mt-6 grid gap-2 border-t border-ink-100 pt-4 text-sm sm:grid-cols-2">
        <Row label="Customer since" value={formatDateLong(customer.createdAt.slice(0, 10))} />
        <Row label="Bookings" value={String(customer.bookingCount)} />
      </dl>

      {/* Upcoming first, and separately — "what have they booked" and "what did they book" are
          different questions, and the first is the one someone on the phone is asking. */}
      <BookingList title="Upcoming" bookings={upcoming} empty="Nothing booked at the moment." />
      <BookingList title="Past" bookings={past} empty="No previous bookings." />
    </Shell>
  );
}

/**
 * Is this booking still ahead of us?
 *
 * <p>Compared against the browser's clock on a club-local date and time, which is close enough
 * for grouping a list: the worst case is a booking that started within the last hour appearing
 * under the wrong heading. Anything that decides what staff may *do* — cancelling, taking
 * payment — is decided by the server, not here.
 */
function isUpcoming(booking: AdminBooking): boolean {
  return new Date(`${booking.date}T${booking.startTime}`).getTime() > Date.now();
}

function BookingList({
  title,
  bookings,
  empty,
}: {
  title: string;
  bookings: AdminBooking[];
  empty: string;
}) {
  return (
    <section className="mt-8">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-600">{title}</h3>
      {bookings.length === 0 ? (
        <p className="mt-3 rounded-card border border-dashed border-ink-300 bg-ink-50 p-6 text-center text-sm text-ink-600">
          {empty}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-ink-100 rounded-card border border-ink-200 bg-white shadow-card">
          {bookings.map((booking) => (
            <li
              key={booking.reference}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div>
                <Link
                  to={`/admin/bookings/${booking.reference}`}
                  className="font-medium text-felt-700 underline underline-offset-2 hover:text-felt-900"
                >
                  {formatDateLong(booking.date)}
                </Link>
                <p className="text-sm text-ink-600">
                  {booking.tableName} · {formatSlotTime(booking.startTime)}–
                  {formatSlotTime(booking.endTime)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-end gap-1">
                  <StatusBadge status={booking.status} />
                  <PaymentBadge booking={booking} />
                </div>
                <span className="w-16 text-right font-medium text-felt-900">
                  {formatPence(booking.pricePence)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-600">{label}</dt>
      <dd className="text-right font-medium text-felt-900">{value}</dd>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Link
        to="/admin/customers"
        className="text-sm font-medium text-felt-700 underline underline-offset-2 hover:text-felt-900"
      >
        Back to customers
      </Link>
      <div className="mt-6">{children}</div>
    </div>
  );
}

import { Link, useParams, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { formatSlotTime } from '@/lib/datetime';
import { formatPence } from '@/lib/money';
import { useBooking, useRetryCheckout } from './useBookings';
import type { Booking } from './types';

/**
 * One booking, and the landing page after Stripe Checkout.
 *
 * <p>The {@code ?payment=complete} parameter is treated as a hint, never as proof. It is just a
 * URL the customer could type; the authoritative answer is the booking's own status, which only
 * a verified webhook (or the server-side return check) can change.
 */
export function BookingPage() {
  const { reference = '' } = useParams();
  const [searchParams] = useSearchParams();
  const justPaid = searchParams.get('payment') === 'complete';

  // Poll only when we have reason to expect a change: the webhook may still be in flight.
  const { data: booking, isPending, isError, error } = useBooking(reference, { poll: justPaid });
  const retry = useRetryCheckout();

  async function handleRetry() {
    const response = await retry.mutateAsync(reference);
    // A full navigation, not a router push: Stripe Checkout is a different origin.
    window.location.assign(response.checkoutUrl);
  }

  if (isPending) {
    return <Shell>
      <p className="text-sm text-gray-500">Loading booking…</p>
    </Shell>;
  }

  if (isError) {
    return (
      <Shell>
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm font-medium text-rose-800">Could not load this booking</p>
          <p className="mt-1 text-sm text-rose-700">{error.message}</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <StatusBanner booking={booking} justPaid={justPaid} onRetry={handleRetry} retrying={retry.isPending} />

      <dl className="mt-6 divide-y divide-gray-200 rounded-lg border border-gray-200">
        <Row label="Reference" value={booking.reference} />
        <Row label="Table" value={booking.tableName} />
        <Row
          label="When"
          value={`${formatDate(booking.date)}, ${formatSlotTime(booking.startTime)}–${formatSlotTime(booking.endTime)}`}
        />
        <Row label="Length" value={formatDuration(booking.durationMinutes)} />
        <Row label="Price" value={formatPence(booking.pricePence)} />
      </dl>

      <p className="mt-6">
        <Link to="/bookings" className="text-sm font-medium text-felt-700 underline">
          All my bookings
        </Link>
      </p>
    </Shell>
  );
}

function StatusBanner({
  booking,
  justPaid,
  onRetry,
  retrying,
}: {
  booking: Booking;
  justPaid: boolean;
  onRetry: () => void;
  retrying: boolean;
}) {
  if (booking.status === 'CONFIRMED') {
    return (
      <div role="status" className="rounded-lg border border-felt-100 bg-felt-50 p-4">
        <p className="text-sm font-semibold text-felt-900">Booking confirmed</p>
        <p className="mt-1 text-sm text-felt-900">
          We have your payment. See you at the club.
        </p>
      </div>
    );
  }

  if (booking.status === 'PENDING_PAYMENT') {
    // Distinguishing these two matters. Immediately after Stripe, "pending" almost always
    // means the webhook is a second behind — telling the customer their payment failed here
    // would send them to pay twice.
    return justPaid ? (
      <div role="status" aria-live="polite" className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-semibold text-amber-900">Confirming your payment…</p>
        <p className="mt-1 text-sm text-amber-800">
          This usually takes a few seconds. You do not need to pay again.
        </p>
      </div>
    ) : (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-semibold text-amber-900">Payment needed</p>
        <p className="mt-1 text-sm text-amber-800">
          Your table is held{booking.holdExpiresAt ? ` until ${formatHoldExpiry(booking.holdExpiresAt)}` : ''}.
        </p>
        <Button className="mt-3" onClick={onRetry} disabled={retrying}>
          {retrying ? 'Opening payment…' : 'Pay now'}
        </Button>
      </div>
    );
  }

  if (booking.status === 'EXPIRED') {
    return (
      <div role="status" className="rounded-lg border border-gray-300 bg-gray-50 p-4">
        <p className="text-sm font-semibold text-gray-900">This booking expired</p>
        <p className="mt-1 text-sm text-gray-700">
          The table was released because payment was not completed in time.
        </p>
        <Link to="/book" className="mt-3 inline-block text-sm font-medium text-felt-700 underline">
          Book another slot
        </Link>
      </div>
    );
  }

  if (booking.status === 'CANCELLED') {
    return (
      <div role="status" className="rounded-lg border border-gray-300 bg-gray-50 p-4">
        <p className="text-sm font-semibold text-gray-900">This booking was cancelled</p>
      </div>
    );
  }

  // COMPLETED and NO_SHOW. Mapped explicitly rather than rendering booking.status, which would
  // show a customer the raw enum name.
  return (
    <div role="status" className="rounded-lg border border-gray-300 bg-gray-50 p-4">
      <p className="text-sm font-semibold text-gray-900">
        {booking.status === 'COMPLETED' ? 'This session has finished' : 'Recorded as a no-show'}
      </p>
      {booking.status === 'NO_SHOW' && (
        <p className="mt-1 text-sm text-gray-700">
          Speak to the club if you think this is wrong.
        </p>
      )}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-felt-900">Your booking</h1>
      <div className="mt-6">{children}</div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 px-4 py-3">
      <dt className="text-sm text-gray-600">{label}</dt>
      <dd className="text-sm font-medium text-felt-900">{value}</dd>
    </div>
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
    year: 'numeric',
  });
}

function formatHoldExpiry(instant: string): string {
  return new Date(instant).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder} mins`;
  const hourPart = hours === 1 ? '1 hour' : `${hours} hours`;
  return remainder === 0 ? hourPart : `${hourPart} ${remainder} mins`;
}

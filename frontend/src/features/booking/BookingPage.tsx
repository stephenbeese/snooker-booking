import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { formatSlotTime } from '@/lib/datetime';
import { formatPence } from '@/lib/money';
import { CancelBookingDialog } from './CancelBookingDialog';
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
  const [cancelling, setCancelling] = useState(false);

  async function handleRetry() {
    const response = await retry.mutateAsync(reference);
    // A full navigation, not a router push: Stripe Checkout is a different origin.
    window.location.assign(response.checkoutUrl);
  }

  if (isPending) {
    return (
      <Shell>
        <div className="h-24 animate-pulse rounded-card bg-ink-100" />
      </Shell>
    );
  }

  if (isError) {
    return (
      <Shell>
        <div role="alert" className="rounded-card border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm font-medium text-rose-800">Could not load this booking</p>
          <p className="mt-1 text-sm text-rose-700">{error.message}</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <StatusBanner
        booking={booking}
        justPaid={justPaid}
        onRetry={handleRetry}
        retrying={retry.isPending}
      />

      <dl className="mt-6 divide-y divide-ink-200 overflow-hidden rounded-card border border-ink-200 bg-white shadow-card">
        <Row label="Reference" value={booking.reference} mono />
        <Row label="Table" value={booking.tableName} />
        <Row
          label="When"
          value={`${formatDate(booking.date)}, ${formatSlotTime(booking.startTime)}–${formatSlotTime(booking.endTime)}`}
        />
        <Row label="Length" value={formatDuration(booking.durationMinutes)} />
        <Row label="Price" value={formatPence(booking.pricePence)} />
      </dl>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <Link
          to="/bookings"
          className="text-sm font-medium text-felt-700 underline underline-offset-2 hover:text-felt-900"
        >
          All my bookings
        </Link>

        {booking.cancellable ? (
          <button
            type="button"
            onClick={() => setCancelling(true)}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-50"
          >
            Cancel booking
          </button>
        ) : (
          // Only worth explaining while the booking is still live; for a cancelled or finished
          // one the status banner above has already said everything.
          booking.cancellationBlockedReason &&
          (booking.status === 'CONFIRMED' || booking.status === 'PENDING_PAYMENT') && (
            <p className="text-sm text-ink-500">{booking.cancellationBlockedReason}</p>
          )
        )}
      </div>

      {cancelling && (
        <CancelBookingDialog booking={booking} onClose={() => setCancelling(false)} />
      )}
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
      <div
        role="status"
        className="flex items-start gap-3 rounded-card border border-felt-200 bg-felt-50 p-5"
      >
        <span
          aria-hidden
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-felt-700 text-white"
        >
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M5 10.5l3.5 3.5L15 7" />
          </svg>
        </span>
        <div>
          <p className="font-semibold text-felt-900">Booking confirmed</p>
          <p className="mt-1 text-sm text-felt-800">We have your payment. See you at the club.</p>
        </div>
      </div>
    );
  }

  if (booking.status === 'PENDING_PAYMENT') {
    // Distinguishing these two matters. Immediately after Stripe, "pending" almost always
    // means the webhook is a second behind — telling the customer their payment failed here
    // would send them to pay twice.
    return justPaid ? (
      <div
        role="status"
        aria-live="polite"
        className="flex items-start gap-3 rounded-card border border-amber-200 bg-amber-50 p-5"
      >
        <span
          aria-hidden
          className="mt-1 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-amber-300 border-t-amber-700"
        />
        <div>
          <p className="font-semibold text-amber-900">Confirming your payment…</p>
          <p className="mt-1 text-sm text-amber-800">
            This usually takes a few seconds. You do not need to pay again.
          </p>
        </div>
      </div>
    ) : (
      <div className="rounded-card border border-amber-200 bg-amber-50 p-5">
        <p className="font-semibold text-amber-900">Payment needed</p>
        <p className="mt-1 text-sm text-amber-800">
          Your table is held
          {booking.holdExpiresAt ? ` until ${formatHoldExpiry(booking.holdExpiresAt)}` : ''}.
        </p>
        <Button className="mt-4" size="lg" onClick={onRetry} disabled={retrying}>
          {retrying ? 'Opening payment…' : 'Pay now'}
        </Button>
      </div>
    );
  }

  if (booking.status === 'EXPIRED') {
    return (
      <div role="status" className="rounded-card border border-ink-300 bg-ink-50 p-5">
        <p className="font-semibold text-ink-900">This booking expired</p>
        <p className="mt-1 text-sm text-ink-700">
          The table was released because payment was not completed in time.
        </p>
        <Link
          to="/book"
          className="mt-4 inline-flex rounded-xl bg-felt-700 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-felt-800"
        >
          Book another slot
        </Link>
      </div>
    );
  }

  if (booking.status === 'CANCELLED') {
    return (
      <div role="status" className="rounded-card border border-ink-300 bg-ink-50 p-5">
        <p className="font-semibold text-ink-900">This booking was cancelled</p>
      </div>
    );
  }

  // COMPLETED and NO_SHOW. Mapped explicitly rather than rendering booking.status, which would
  // show a customer the raw enum name.
  return (
    <div role="status" className="rounded-card border border-ink-300 bg-ink-50 p-5">
      <p className="font-semibold text-ink-900">
        {booking.status === 'COMPLETED' ? 'This session has finished' : 'Recorded as a no-show'}
      </p>
      {booking.status === 'NO_SHOW' && (
        <p className="mt-1 text-sm text-ink-700">Speak to the club if you think this is wrong.</p>
      )}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-felt-900">Your booking</h1>
      <div className="mt-8">{children}</div>
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 px-5 py-3.5">
      <dt className="text-sm text-ink-600">{label}</dt>
      <dd className={`text-sm font-medium text-felt-900 ${mono ? 'font-mono' : ''}`}>{value}</dd>
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

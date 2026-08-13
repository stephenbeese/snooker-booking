import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { ApiError } from '@/lib/apiError';
import { formatSlotTime } from '@/lib/datetime';
import { formatPence } from '@/lib/money';
import { StatusBadge } from './components/StatusBadge';
import { useAdminBooking, useAdminCancelBooking } from './useAdmin';
import type { AdminBooking } from './types';

const SOURCE_LABEL: Record<AdminBooking['source'], string> = {
  ONLINE: 'Booked online',
  TELEPHONE: 'Taken over the phone',
  ADMIN: 'Created by staff',
};

export function AdminBookingDetailPage() {
  const { reference = '' } = useParams();
  const { data: booking, isPending, isError, error } = useAdminBooking(reference);

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
          <p className="text-sm font-medium text-rose-800">Could not load this booking</p>
          <p className="mt-1 text-sm text-rose-700">{error.message}</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-sm text-ink-500">{booking.reference}</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-felt-900">
            {booking.tableName}
          </h2>
          <p className="mt-1 text-ink-600">
            {formatDate(booking.date)}, {formatSlotTime(booking.startTime)}–
            {formatSlotTime(booking.endTime)}
          </p>
        </div>
        <StatusBadge status={booking.status} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-card border border-ink-200 bg-white p-5 shadow-card">
          <h3 className="text-sm font-medium uppercase tracking-wide text-ink-500">Customer</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Name" value={booking.customerName} />
            <Row label="Email" value={booking.customerEmail ?? '—'} />
            <Row label="Phone" value={booking.customerPhone ?? '—'} />
          </dl>
        </section>

        <section className="rounded-card border border-ink-200 bg-white p-5 shadow-card">
          <h3 className="text-sm font-medium uppercase tracking-wide text-ink-500">Booking</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Price" value={formatPence(booking.pricePence)} />
            <Row label="Length" value={`${booking.durationMinutes} minutes`} />
            <Row label="Source" value={SOURCE_LABEL[booking.source]} />
            <Row label="Created" value={formatInstant(booking.createdAt)} />
            {booking.holdExpiresAt && (
              <Row label="Hold expires" value={formatInstant(booking.holdExpiresAt)} />
            )}
            {booking.cancelledAt && (
              <Row label="Cancelled" value={formatInstant(booking.cancelledAt)} />
            )}
            {booking.cancellationReason && (
              <Row label="Reason given" value={booking.cancellationReason} />
            )}
          </dl>
        </section>
      </div>

      {booking.notes && (
        <section className="mt-6 rounded-card border border-ink-200 bg-white p-5 shadow-card">
          <h3 className="text-sm font-medium uppercase tracking-wide text-ink-500">Notes</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm text-ink-700">{booking.notes}</p>
        </section>
      )}

      <CancelPanel booking={booking} />
    </Shell>
  );
}

/**
 * Staff cancellation.
 *
 * <p>Whether this is offered at all comes from the server's `cancellable` flag, exactly as on
 * the customer's page. Staff bypass the notice period, but that decision is made by
 * `CancellationPolicy` on the server and merely reported here — a client that decided for itself
 * would offer a button the API then refuses.
 */
function CancelPanel({ booking }: { booking: AdminBooking }) {
  const cancel = useAdminCancelBooking();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');

  if (!booking.cancellable) {
    return booking.cancellationBlockedReason && !booking.cancelledAt ? (
      <p className="mt-6 text-sm text-ink-500">{booking.cancellationBlockedReason}</p>
    ) : null;
  }

  const errorMessage =
    cancel.error instanceof ApiError
      ? cancel.error.message
      : cancel.error
        ? 'Could not cancel this booking. Please try again.'
        : null;

  return (
    <section className="mt-8 rounded-card border border-rose-200 bg-rose-50 p-5">
      <h3 className="font-medium text-rose-900">Cancel this booking</h3>
      <p className="mt-1 text-sm text-rose-800">
        This releases the table for someone else to book. If the customer has paid, the
        cancellation is flagged for a refund decision — no money moves automatically.
      </p>

      {!confirming ? (
        <Button variant="danger" className="mt-4" onClick={() => setConfirming(true)}>
          Cancel booking
        </Button>
      ) : (
        <div className="mt-4">
          <label
            htmlFor="admin-cancel-reason"
            className="block text-sm font-medium text-rose-900"
          >
            Reason <span className="font-normal text-rose-700">(optional, kept on record)</span>
          </label>
          <textarea
            id="admin-cancel-reason"
            rows={2}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="mt-1.5 block w-full rounded-lg bg-white px-3.5 py-2.5 text-sm text-ink-900 ring-1 ring-inset ring-rose-300 focus:ring-2 focus:ring-inset focus:ring-rose-500 focus:outline-none"
          />

          {errorMessage && (
            <div role="alert" className="mt-3 rounded-lg border border-rose-300 bg-white p-3">
              <p className="text-sm text-rose-800">{errorMessage}</p>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="danger"
              disabled={cancel.isPending}
              onClick={() =>
                cancel.mutate({
                  reference: booking.reference,
                  ...(reason.trim() ? { reason: reason.trim() } : {}),
                })
              }
            >
              {cancel.isPending ? 'Cancelling…' : 'Confirm cancellation'}
            </Button>
            <Button
              variant="secondary"
              disabled={cancel.isPending}
              onClick={() => setConfirming(false)}
            >
              Keep booking
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-sm font-medium uppercase tracking-wide text-ink-500">Booking</h1>
        <Link
          to="/admin/bookings"
          className="text-sm font-medium text-felt-700 underline underline-offset-2 hover:text-felt-900"
        >
          Back to bookings
        </Link>
      </div>
      <div className="mt-6">{children}</div>
    </div>
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

function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) {
    return isoDate;
  }
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatInstant(instant: string): string {
  return new Date(instant).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

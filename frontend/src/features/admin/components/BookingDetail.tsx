import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useTableTypeLabel } from '@/features/availability/useAvailability';
import { ApiError } from '@/lib/apiError';
import { formatSlotTime } from '@/lib/datetime';
import { formatPence } from '@/lib/money';
import { PaymentBadge } from './PaymentBadge';
import { StatusBadge } from './StatusBadge';
import { useAdminBooking, useAdminCancelBooking, useRecordCounterPayment } from '../useAdmin';
import type { AdminBooking, CounterPaymentStatus, PaymentStatus } from '../types';

const SOURCE_LABEL: Record<AdminBooking['source'], string> = {
  ONLINE: 'Booked online',
  TELEPHONE: 'Taken over the phone',
  ADMIN: 'Created by staff',
};

/**
 * Payment state in words.
 *
 * <p>`NONE` stands in for a null status — a booking with no payment row at all. Keyed as a
 * `Record` over every status so adding one to the union is a type error here rather than a blank
 * line on the page.
 */
const PAYMENT_LABEL: Record<PaymentStatus | 'NONE', string> = {
  NONE: 'Nothing recorded',
  REQUIRES_PAYMENT: 'Awaiting payment',
  PROCESSING: 'In progress',
  SUCCEEDED: 'Paid online',
  FAILED: 'Card declined',
  REFUNDED: 'Refunded',
  PARTIALLY_REFUNDED: 'Partially refunded',
  PAID_AT_COUNTER: 'Paid at the counter',
  WAIVED: 'Waived',
};

/**
 * One booking, in full: heading, counter payment, the two detail columns, notes and
 * cancellation.
 *
 * <p>Lifted out of `AdminBookingDetailPage` so the diary can open the same record in a modal
 * without navigating away. Both callers render *this*, rather than the modal reproducing the
 * page's sections — two copies would drift the moment a field is added to one of them.
 *
 * <p>Owns its own query rather than taking a booking as a prop. The modal has only a reference
 * to hand (it comes from the URL), and fetching here means both callers share one cache entry
 * and one set of loading and error states.
 *
 * <p>Deliberately renders no page chrome — no heading, no back link, no `PageShell`. The page
 * supplies that through its own `Shell`; a modal must not.
 */
export function BookingDetail({ reference }: { reference: string }) {
  const { data: booking, isPending, isError, error } = useAdminBooking(reference);
  const typeLabel = useTableTypeLabel();

  if (isPending) {
    return <div className="h-64 animate-pulse rounded-card bg-ink-100" />;
  }

  if (isError) {
    return (
      <div role="alert" className="rounded-card border border-rose-200 bg-rose-50 p-4">
        <p className="text-sm font-medium text-rose-800">Could not load this booking</p>
        <p className="mt-1 text-sm text-rose-700">{error.message}</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-sm text-ink-500">{booking.reference}</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-felt-900">
            {booking.tableName}
          </h2>
          {/* The type under the name: "Table 3" says nothing about what you can play on it. */}
          <p className="text-sm text-fg-muted">{typeLabel(booking.tableType)}</p>
          <p className="mt-1 text-ink-600">
            {formatDate(booking.date)}, {formatSlotTime(booking.startTime)}–
            {formatSlotTime(booking.endTime)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={booking.status} />
          <PaymentBadge booking={booking} />
        </div>
      </div>

      <SettlePanel booking={booking} />

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
            <Row label="Payment" value={PAYMENT_LABEL[booking.paymentStatus ?? 'NONE']} />
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
    </>
  );
}

/**
 * Taking money at the counter.
 *
 * <p>Shown only when the server says something is owed there. Rendering it for an online booking
 * would offer staff a way to mark a card payment as cash, which the endpoint refuses anyway —
 * a button whose only outcome is an error.
 *
 * <p>"Waive" sits behind a second click, not because the server needs it but because comping a
 * session is the one action here with no receipt to reconcile against later.
 */
function SettlePanel({ booking }: { booking: AdminBooking }) {
  const record = useRecordCounterPayment();
  const toast = useToast();
  const [waiving, setWaiving] = useState(false);

  /**
   * Records the outcome and says so.
   *
   * <p>The amount is read before the mutation: on success the panel unmounts, because the
   * server no longer reports anything payable — so `booking.amountOutstandingPence` is gone
   * by the time the toast would otherwise read it.
   */
  function settle(status: CounterPaymentStatus) {
    const amount = formatPence(booking.amountOutstandingPence);
    record.mutate(
      { reference: booking.reference, status },
      {
        onSuccess: () =>
          toast(
            status === 'PAID_AT_COUNTER'
              ? `${amount} recorded as paid at the counter.`
              : `${amount} waived. Nothing to collect.`,
          ),
      },
    );
  }

  if (!booking.payableAtCounter) {
    return null;
  }

  const errorMessage =
    record.error instanceof ApiError
      ? record.error.message
      : record.error
        ? 'Could not record this payment. Please try again.'
        : null;

  return (
    <section className="mt-6 rounded-card border border-amber-200 bg-amber-50 p-5">
      <h3 className="font-medium text-amber-900">
        {formatPence(booking.amountOutstandingPence)} to collect
      </h3>
      <p className="mt-1 text-sm text-amber-800">
        This booking was taken over the phone. Record the payment once the customer has paid at
        the counter.
      </p>

      {errorMessage && (
        <div role="alert" className="mt-3 rounded-lg border border-rose-300 bg-white p-3">
          <p className="text-sm text-rose-800">{errorMessage}</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          disabled={record.isPending}
          onClick={() => settle('PAID_AT_COUNTER')}
        >
          {record.isPending ? 'Recording…' : 'Mark as paid'}
        </Button>

        {!waiving ? (
          <Button variant="secondary" disabled={record.isPending} onClick={() => setWaiving(true)}>
            Waive payment
          </Button>
        ) : (
          <>
            <Button
              variant="secondary"
              disabled={record.isPending}
              onClick={() => settle('WAIVED')}
            >
              Confirm waiver
            </Button>
            <Button variant="secondary" disabled={record.isPending} onClick={() => setWaiving(false)}>
              Keep the charge
            </Button>
          </>
        )}
      </div>
    </section>
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
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');

  function confirmCancel() {
    cancel.mutate(
      {
        reference: booking.reference,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      },
      {
        // This whole panel unmounts on success, since the booking stops being cancellable.
        // Without a toast the only trace is a badge change further up the page.
        // Reads the status the server came back with rather than predicting the outcome: a
        // cancellation inside the notice period is refunded before this response is built, so
        // guessing from the amount alone would report a refund decision that was already made.
        onSuccess: (cancelled) =>
          toast(
            cancelled.paymentStatus === 'REFUNDED'
              ? `Booking ${cancelled.reference} cancelled and refunded in full.`
              : cancelled.amountOutstandingPence > 0 || cancelled.paymentStatus === 'SUCCEEDED'
                ? `Booking ${cancelled.reference} cancelled and flagged for a refund decision.`
                : `Booking ${cancelled.reference} cancelled. The table is back on sale.`,
          ),
      },
    );
  }

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
        This releases the table for someone else to book. A paid booking still inside the
        notice period is refunded in full; after it, the refund is raised for someone to
        decide.
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
              onClick={confirmCancel}
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

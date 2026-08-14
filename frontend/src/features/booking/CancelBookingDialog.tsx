import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/apiError';
import { formatSlotTime } from '@/lib/datetime';
import { formatPence } from '@/lib/money';
import type { Booking } from './types';
import { useCancelBooking } from './useBookings';

/**
 * Confirms a cancellation before performing it.
 *
 * <p>A confirmation step for an action that cannot be undone and may forfeit money. The dialog
 * states what is being cancelled rather than asking "are you sure?", so someone with several
 * bookings can see they are about to release the right one.
 */
export function CancelBookingDialog({
  booking,
  onClose,
}: {
  booking: Booking;
  onClose: () => void;
}) {
  const cancel = useCancelBooking();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  // Focus moves into the dialog, and Escape closes it: without both, a keyboard user is left
  // tabbing around the page behind an open modal with no way out.
  useEffect(() => {
    cancelButtonRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !cancel.isPending) {
        onClose();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, cancel.isPending]);

  async function handleConfirm() {
    try {
      await cancel.mutateAsync({ reference: booking.reference, ...(reason ? { reason } : {}) });
      onClose();
      // The dialog closing is otherwise the only sign anything happened, and it closes on
      // Escape too. Naming the reference distinguishes "cancelled" from "changed my mind
      // about cancelling".
      toast(`Booking ${booking.reference} cancelled.`);
    } catch {
      // Rendered from the mutation's error state below.
    }
  }

  const errorMessage =
    cancel.error instanceof ApiError
      ? cancel.error.message
      : cancel.error
        ? 'Could not cancel this booking. Please try again.'
        : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 p-4 backdrop-blur-sm sm:items-center">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-dialog-title"
        className="w-full max-w-md rounded-card bg-white p-6 shadow-lifted"
      >
        <h2 id="cancel-dialog-title" className="text-lg font-semibold tracking-tight text-felt-900">
          Cancel this booking?
        </h2>

        <div className="mt-4 rounded-lg bg-ink-50 p-4 text-sm">
          <p className="font-medium text-felt-900">{booking.tableName}</p>
          <p className="mt-1 text-ink-600">
            {formatDate(booking.date)}, {formatSlotTime(booking.startTime)}–
            {formatSlotTime(booking.endTime)}
          </p>
          <p className="mt-1 text-ink-600">{formatPence(booking.pricePence)}</p>
        </div>

        {booking.status === 'CONFIRMED' && (
          // Honest about the money rather than promising a refund the club has not decided on.
          <p className="mt-4 text-sm text-ink-600">
            This releases your table. If you have paid, the club will be in touch about a refund.
          </p>
        )}

        <div className="mt-4">
          <label htmlFor="cancel-reason" className="block text-sm font-medium text-felt-900">
            Reason <span className="font-normal text-ink-500">(optional)</span>
          </label>
          <textarea
            id="cancel-reason"
            rows={2}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="mt-1.5 block w-full rounded-lg px-3.5 py-2.5 text-sm text-ink-900 ring-1 ring-inset ring-ink-300 focus:ring-2 focus:ring-inset focus:ring-felt-600 focus:outline-none"
          />
        </div>

        {errorMessage && (
          <div role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3">
            <p className="text-sm text-rose-800">{errorMessage}</p>
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            ref={cancelButtonRef}
            variant="secondary"
            onClick={onClose}
            disabled={cancel.isPending}
          >
            Keep booking
          </Button>
          <Button variant="danger" onClick={handleConfirm} disabled={cancel.isPending}>
            {cancel.isPending ? 'Cancelling…' : 'Yes, cancel it'}
          </Button>
        </div>
      </div>
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
  });
}

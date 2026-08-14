import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { BookingDetail } from './BookingDetail';

/**
 * A booking's details, over the page that opened them.
 *
 * <p>The diary is a place staff work down a day, and sending them to a separate page for every
 * booking meant losing the day and navigating back to it each time. The record opens in place
 * instead, and the grid stays behind it.
 *
 * <p>Renders {@link BookingDetail} — the same component the standalone page renders, not a
 * second copy of its sections. It also keeps a link to that page, since a modal is a poor place
 * to leave a booking open when someone wants to keep it in front of them.
 */
export function BookingDetailDialog({
  reference,
  onClose,
}: {
  reference: string;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Focus moves into the dialog, and Escape closes it: without both, a keyboard user is left
  // tabbing around the diary behind an open modal with no way out. Matches CancelBookingDialog,
  // which is where this pattern is already established.
  useEffect(() => {
    closeButtonRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    // Clicking the backdrop closes, which is the other half of what Escape does for the
    // keyboard. The handler is on the backdrop alone — putting it on a wrapper around the panel
    // would close the dialog on every click inside it.
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-dialog-title"
        // Wider than a confirmation dialog and scrollable: the body is a two-column grid with
        // panels under it, and on a laptop it is taller than the viewport.
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-card bg-white p-6 shadow-lifted"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4">
          <h2
            id="booking-dialog-title"
            className="text-sm font-medium uppercase tracking-wide text-ink-500"
          >
            Booking
          </h2>
          <div className="flex items-center gap-4">
            <Link
              to={`/admin/bookings/${encodeURIComponent(reference)}`}
              className="text-sm font-medium text-felt-700 underline underline-offset-2 hover:text-felt-900"
            >
              Open full page
            </Link>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg px-2 py-1 text-lg leading-none text-ink-500 hover:bg-ink-100 hover:text-felt-900"
            >
              ×
            </button>
          </div>
        </div>

        <div className="mt-6">
          <BookingDetail reference={reference} />
        </div>
      </div>
    </div>
  );
}

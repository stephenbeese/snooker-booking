import { formatPence } from '@/lib/money';
import type { AdminBooking } from '../types';

/**
 * What the club is owed for a booking, as staff need to read it at a glance.
 *
 * <p>Deliberately loud when money is due and quiet when it is not. A counter payment is the one
 * state that requires somebody to *do* something as the customer walks in, so it carries the
 * amount; everything else is a fact about the past and gets a plain grey line.
 *
 * <p>Reads the server's `payableAtCounter` rather than deriving it from the status and provider.
 * The rule for "does this need collecting" lives in `PaymentSummary`, and a second copy here
 * would eventually disagree with the endpoint that refuses or accepts the payment.
 */
export function PaymentBadge({ booking }: { booking: AdminBooking }) {
  if (booking.payableAtCounter) {
    return (
      <span className="inline-block whitespace-nowrap rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
        Pay on arrival — {formatPence(booking.amountOutstandingPence)} due
      </span>
    );
  }

  if (booking.paymentStatus === 'PAID_AT_COUNTER') {
    return <Settled>Paid at the counter</Settled>;
  }

  if (booking.paymentStatus === 'WAIVED') {
    return <Settled>Waived</Settled>;
  }

  // Online payments already read from the booking's own status badge next to this one, so
  // repeating "paid" there would be noise. Anything else — a hold not yet handed to Stripe, a
  // failed card, a booking predating payments — has nothing useful to tell staff here.
  return null;
}

function Settled({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block whitespace-nowrap rounded-full bg-ink-100 px-2.5 py-0.5 text-xs font-medium text-ink-700">
      {children}
    </span>
  );
}

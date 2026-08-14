import { Badge } from '@/components/ui/Badge';
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
    // font-semibold overrides the shared font-medium on purpose: this is the one badge that
    // asks staff to act, and it has to win against the status badge sitting beside it.
    return (
      <Badge tone="pending" className="font-semibold">
        Pay on arrival — {formatPence(booking.amountOutstandingPence)} due
      </Badge>
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
  return <Badge tone="neutral">{children}</Badge>;
}

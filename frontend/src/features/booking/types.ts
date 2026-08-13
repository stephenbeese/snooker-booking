export type BookingStatus =
  | 'PENDING_PAYMENT'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'COMPLETED'
  | 'NO_SHOW';

export interface Booking {
  reference: string;
  tableId: number;
  tableName: string;
  /** Club-local, ISO date. */
  date: string;
  startTime: string;
  endTime: string;
  /** Authoritative instants; the local fields above are for display. */
  startAt: string;
  endAt: string;
  durationMinutes: number;
  pricePence: number;
  status: BookingStatus;
  /** Present only while PENDING_PAYMENT. */
  holdExpiresAt: string | null;
  customerName: string;
  notes: string | null;
  /**
   * Whether the server would accept a cancellation right now.
   *
   * <p>Never recomputed on the client. The rule depends on the club's configured notice period
   * and the server's clock, so deriving it here would eventually enable a button the API
   * rejects — or disable one when cancelling was allowed.
   */
  cancellable: boolean;
  /** When the cancellation window closes; null when no notice period applies. */
  cancellableUntil: string | null;
  /** Why cancellation is unavailable, in words fit to show the customer. */
  cancellationBlockedReason: string | null;
  cancelledAt: string | null;
}

export interface CreateBookingRequest {
  tableId: number;
  date: string;
  startTime: string;
  durationMinutes: number;
  notes?: string;
}

export interface CheckoutResponse {
  booking: Booking;
  /** Stripe-hosted page; requires a full page navigation, not a client-side route change. */
  checkoutUrl: string;
}

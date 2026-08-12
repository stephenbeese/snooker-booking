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

import { apiRequest } from '@/lib/apiClient';
import type { Booking, CheckoutResponse, CreateBookingRequest } from './types';

/**
 * Creates a booking and returns where to pay.
 *
 * <p>Note what is absent from the request: the price. It is computed server-side from the
 * persisted booking, so a tampered client cannot pay less than the club charges.
 */
export function createBooking(request: CreateBookingRequest): Promise<CheckoutResponse> {
  return apiRequest<CheckoutResponse>('/api/bookings', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export function fetchMyBookings(): Promise<Booking[]> {
  return apiRequest<Booking[]>('/api/bookings');
}

export function fetchBooking(reference: string): Promise<Booking> {
  return apiRequest<Booking>(`/api/bookings/${encodeURIComponent(reference)}`);
}

/** Cancels a booking. The server decides whether it is allowed; this just asks. */
export function cancelBooking(reference: string, reason?: string): Promise<Booking> {
  return apiRequest<Booking>(`/api/bookings/${encodeURIComponent(reference)}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason: reason ?? null }),
  });
}

/** A fresh Checkout session after a declined card. The hold survives, so the slot is kept. */
export function retryCheckout(reference: string): Promise<CheckoutResponse> {
  return apiRequest<CheckoutResponse>(
    `/api/bookings/${encodeURIComponent(reference)}/checkout`,
    { method: 'POST' },
  );
}

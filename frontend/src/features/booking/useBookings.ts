import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { createBooking, fetchBooking, fetchMyBookings, retryCheckout } from './api';
import type { Booking, CreateBookingRequest } from './types';

export function useMyBookings() {
  return useQuery({
    queryKey: queryKeys.myBookings(),
    queryFn: fetchMyBookings,
  });
}

/**
 * One booking, polled while it is still being confirmed.
 *
 * <p>After returning from Stripe the booking is often still PENDING_PAYMENT for a second or
 * two: the webhook has not landed yet. That is a legitimate "confirming…" state rather than a
 * failure, so the page polls instead of declaring the payment lost. Polling stops as soon as
 * the status settles, so a confirmed booking costs no further requests.
 */
export function useBooking(reference: string, options: { poll?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.booking(reference),
    queryFn: () => fetchBooking(reference),
    refetchInterval: (query) => {
      if (!options.poll) {
        return false;
      }
      const booking = query.state.data;
      return booking && booking.status === 'PENDING_PAYMENT' ? 2000 : false;
    },
  });
}

export function useCreateBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateBookingRequest) => createBooking(request),
    onSuccess: async () => {
      // The grid must not keep showing the slot just taken. Availability is invalidated even
      // though the customer is about to be redirected — they may come straight back.
      await queryClient.invalidateQueries({ queryKey: ['availability'] });
      await queryClient.invalidateQueries({ queryKey: queryKeys.myBookings() });
    },
  });
}

export function useRetryCheckout() {
  return useMutation({
    mutationFn: (reference: string) => retryCheckout(reference),
  });
}

/** Whether a booking still needs paying for. */
export function isAwaitingPayment(booking: Booking): boolean {
  return booking.status === 'PENDING_PAYMENT';
}

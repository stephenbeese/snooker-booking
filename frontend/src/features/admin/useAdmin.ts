import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import {
  cancelBookingAsAdmin,
  fetchAdminBooking,
  fetchAdminBookings,
  fetchAdminDay,
  fetchDashboard,
  fetchTables,
} from './api';
import type { AdminBookingFilters } from './types';

export function useAdminDashboard() {
  return useQuery({
    queryKey: queryKeys.adminDashboard(),
    queryFn: fetchDashboard,
  });
}

/**
 * The filtered booking list.
 *
 * <p>`keepPreviousData` so changing a filter or turning a page does not blank the table and
 * collapse the layout for the duration of the request — the previous rows stay put and are
 * replaced when the new ones arrive.
 */
export function useAdminBookings(filters: AdminBookingFilters) {
  return useQuery({
    queryKey: queryKeys.adminBookings(filters),
    queryFn: () => fetchAdminBookings(filters),
    placeholderData: keepPreviousData,
  });
}

export function useAdminBooking(reference: string) {
  return useQuery({
    queryKey: queryKeys.adminBooking(reference),
    queryFn: () => fetchAdminBooking(reference),
  });
}

export function useAdminDay(date: string) {
  return useQuery({
    queryKey: queryKeys.adminDay(date),
    queryFn: () => fetchAdminDay(date),
    placeholderData: keepPreviousData,
  });
}

export function useTables() {
  return useQuery({
    queryKey: queryKeys.tables(),
    queryFn: fetchTables,
  });
}

/**
 * Cancels a booking as staff.
 *
 * <p>Invalidates broadly on purpose. A cancellation changes the dashboard counts, every filtered
 * list that might contain the booking, and — because the slot is released — the availability
 * grid a customer is looking at. Invalidating only the one booking would leave staff staring at
 * a total that no longer adds up.
 */
export function useAdminCancelBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reference, reason }: { reference: string; reason?: string }) =>
      cancelBookingAsAdmin(reference, reason),
    onSuccess: async (booking) => {
      queryClient.setQueryData(queryKeys.adminBooking(booking.reference), booking);
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
      await queryClient.invalidateQueries({ queryKey: ['availability'] });
      // The customer's own view of this booking is now wrong too.
      await queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
}

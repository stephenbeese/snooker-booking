import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import {
  cancelBookingAsAdmin,
  createMaintenanceBlock,
  createTable,
  createTelephoneBooking,
  deleteMaintenanceBlock,
  fetchAdminBooking,
  fetchAdminBookings,
  fetchAdminDay,
  fetchAdminTables,
  fetchDashboard,
  fetchMaintenanceBlocks,
  fetchTables,
  setTableActive,
  updateTable,
} from './api';
import type { AdminBookingFilters, TableInput } from './types';

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
export function useAdminTables() {
  return useQuery({
    queryKey: queryKeys.adminTables(),
    queryFn: fetchAdminTables,
  });
}

export function useMaintenanceBlocks(from: string, to: string) {
  return useQuery({
    queryKey: queryKeys.adminBlocks(from, to),
    queryFn: () => fetchMaintenanceBlocks(from, to),
    placeholderData: keepPreviousData,
  });
}

/**
 * Everything a table or block change invalidates.
 *
 * <p>Shared by all four mutations below because they all have the same reach: adding a table,
 * renaming one, taking one off sale or blocking one changes what the availability grid shows a
 * customer *right now*. Invalidating only the admin list would leave the grid advertising a
 * table that has just been withdrawn.
 */
function useInvalidateClubStructure() {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin'] });
    await queryClient.invalidateQueries({ queryKey: ['availability'] });
    await queryClient.invalidateQueries({ queryKey: queryKeys.tables() });
  };
}

export function useCreateTable() {
  const invalidate = useInvalidateClubStructure();
  return useMutation({ mutationFn: createTable, onSuccess: invalidate });
}

export function useUpdateTable() {
  const invalidate = useInvalidateClubStructure();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: TableInput }) => updateTable(id, input),
    onSuccess: invalidate,
  });
}

export function useSetTableActive() {
  const invalidate = useInvalidateClubStructure();
  return useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => setTableActive(id, active),
    onSuccess: invalidate,
  });
}

export function useCreateMaintenanceBlock() {
  const invalidate = useInvalidateClubStructure();
  return useMutation({ mutationFn: createMaintenanceBlock, onSuccess: invalidate });
}

export function useDeleteMaintenanceBlock() {
  const invalidate = useInvalidateClubStructure();
  return useMutation({ mutationFn: deleteMaintenanceBlock, onSuccess: invalidate });
}

/**
 * Takes a booking over the phone.
 *
 * <p>Invalidates the same set: a new booking removes a slot from the grid, and moves the
 * dashboard's counts and expected revenue.
 */
export function useCreateTelephoneBooking() {
  const invalidate = useInvalidateClubStructure();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createTelephoneBooking,
    onSuccess: async () => {
      await invalidate();
      await queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
}

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

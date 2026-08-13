import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { fetchAdminAvailability, fetchAvailability, type AvailabilityQuery } from './api';

export function useAvailability({ date, durationMinutes, tableIds }: AvailabilityQuery) {
  return useQuery({
    queryKey: queryKeys.availability(date, durationMinutes, tableIds),
    queryFn: () => fetchAvailability({ date, durationMinutes, tableIds }),
    // Keeps the previous day's grid on screen while the next loads, so changing date
    // does not flash an empty grid.
    placeholderData: keepPreviousData,
    // Availability goes stale quickly: someone else may take a slot at any moment.
    staleTime: 15_000,
  });
}

/**
 * The same grid as staff may book it: notice and advance limits lifted, everything
 * physical still enforced. A separate endpoint rather than a parameter on the public one,
 * so relaxing a rule for staff can never be requested by a customer's browser.
 */
export function useAdminAvailability({ date, durationMinutes, tableIds }: AvailabilityQuery) {
  return useQuery({
    queryKey: queryKeys.adminAvailability(date, durationMinutes, tableIds),
    queryFn: () => fetchAdminAvailability({ date, durationMinutes, tableIds }),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { fetchAvailability, type AvailabilityQuery } from './api';

export function useAvailability({ date, durationMinutes, tableIds }: AvailabilityQuery) {
  return useQuery({
    queryKey: queryKeys.availability(date, durationMinutes),
    queryFn: () => fetchAvailability({ date, durationMinutes, tableIds }),
    // Keeps the previous day's grid on screen while the next loads, so changing date
    // does not flash an empty grid.
    placeholderData: keepPreviousData,
    // Availability goes stale quickly: someone else may take a slot at any moment.
    staleTime: 15_000,
  });
}

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import {
  fetchAdminAvailability,
  fetchAvailability,
  fetchTableTypes,
  type AvailabilityQuery,
} from './api';
import type { TableType } from './types';

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

/**
 * The club's table types, for labelling and for filling pickers.
 *
 * <p>Long `staleTime`: types change when a manager adds one, which is roughly never compared
 * with how often this is read — every grid, filter and form renders from it.
 */
export function useTableTypes() {
  return useQuery({
    queryKey: queryKeys.tableTypes(),
    queryFn: fetchTableTypes,
    staleTime: 5 * 60_000,
  });
}

/**
 * A code→label lookup that degrades to the code itself.
 *
 * <p>Falling back to the raw code matters: a table can carry a type that has since been
 * withdrawn, and that type is absent from this list. Rendering the code is ugly but truthful,
 * where rendering "undefined" — or nothing at all — is neither.
 */
export function useTableTypeLabel(): (code: TableType) => string {
  const { data } = useTableTypes();
  // Array.isArray rather than a truthiness check: this is a lookup for captioning a name, and
  // it must never be the reason a page fails to render. `data` is whatever the endpoint
  // answered, so a proxy error page or a misrouted response would otherwise throw here and
  // take the whole booking page down with it.
  const types = Array.isArray(data) ? data : [];
  return (code) => types.find((type) => type.code === code)?.label ?? code;
}

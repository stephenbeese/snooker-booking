import { apiRequest } from '@/lib/apiClient';
import type { DayAvailability } from './types';

export interface AvailabilityQuery {
  date: string;
  durationMinutes?: number | undefined;
  tableIds?: number[] | undefined;
}

function availabilityParams({ date, durationMinutes, tableIds }: AvailabilityQuery): string {
  const params = new URLSearchParams({ date });
  if (durationMinutes !== undefined) {
    params.set('durationMinutes', String(durationMinutes));
  }
  // Repeated tableId params, matching the backend's List<Long> binding.
  tableIds?.forEach((id) => params.append('tableId', String(id)));
  return params.toString();
}

export function fetchAvailability(query: AvailabilityQuery): Promise<DayAvailability> {
  return apiRequest<DayAvailability>(`/api/availability?${availabilityParams(query)}`);
}

/**
 * Availability under the staff booking policy. Same shape, same query parameters — the
 * only difference is which rules the server applied, which is why it is a different path
 * rather than a flag the caller sets.
 */
export function fetchAdminAvailability(query: AvailabilityQuery): Promise<DayAvailability> {
  return apiRequest<DayAvailability>(`/api/admin/availability?${availabilityParams(query)}`);
}

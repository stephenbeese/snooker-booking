import { apiRequest } from '@/lib/apiClient';
import type { DayAvailability, TableTypeOption } from './types';

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

/**
 * The table types the club offers, with the label to render for each.
 *
 * <p>Public and read-only. Since Phase 7 the codes are rows a manager can add, so every screen
 * that shows a type must look its label up here rather than hold a hardcoded map — one that a
 * newly added type would simply be missing from.
 */
export function fetchTableTypes(): Promise<TableTypeOption[]> {
  return apiRequest<TableTypeOption[]>('/api/tables/types');
}

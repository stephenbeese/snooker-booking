import { apiRequest } from '@/lib/apiClient';
import type { DayAvailability } from './types';

export interface AvailabilityQuery {
  date: string;
  durationMinutes?: number | undefined;
  tableIds?: number[] | undefined;
}

export function fetchAvailability({
  date,
  durationMinutes,
  tableIds,
}: AvailabilityQuery): Promise<DayAvailability> {
  const params = new URLSearchParams({ date });
  if (durationMinutes !== undefined) {
    params.set('durationMinutes', String(durationMinutes));
  }
  // Repeated tableId params, matching the backend's List<Long> binding.
  tableIds?.forEach((id) => params.append('tableId', String(id)));

  return apiRequest<DayAvailability>(`/api/availability?${params.toString()}`);
}

import { apiRequest } from '@/lib/apiClient';
import type {
  AdminBooking,
  AdminBookingFilters,
  AdminDashboard,
  ClubTable,
  Paged,
} from './types';

/**
 * Turns the filter object into a query string.
 *
 * <p>Empty values are omitted rather than sent blank: `?search=` would reach the server as an
 * empty string, and a filter for "nothing" is not the same request as no filter at all.
 * Multiple statuses repeat the key, which is what Spring binds to a Set.
 */
function toQueryString(filters: AdminBookingFilters): string {
  const params = new URLSearchParams();

  filters.status?.forEach((status) => params.append('status', status));
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.tableId !== undefined) params.set('tableId', String(filters.tableId));
  if (filters.search?.trim()) params.set('search', filters.search.trim());
  if (filters.page) params.set('page', String(filters.page));
  if (filters.size) params.set('size', String(filters.size));

  const query = params.toString();
  return query ? `?${query}` : '';
}

export function fetchDashboard(): Promise<AdminDashboard> {
  return apiRequest<AdminDashboard>('/api/admin/dashboard');
}

export function fetchAdminBookings(
  filters: AdminBookingFilters,
): Promise<Paged<AdminBooking>> {
  return apiRequest<Paged<AdminBooking>>(`/api/admin/bookings${toQueryString(filters)}`);
}

export function fetchAdminBooking(reference: string): Promise<AdminBooking> {
  return apiRequest<AdminBooking>(`/api/admin/bookings/${encodeURIComponent(reference)}`);
}

/** Bookings for one club-local day, in start order. */
export function fetchAdminDay(date: string): Promise<AdminBooking[]> {
  return apiRequest<AdminBooking[]>(
    `/api/admin/bookings/day?date=${encodeURIComponent(date)}`,
  );
}

export function cancelBookingAsAdmin(
  reference: string,
  reason?: string,
): Promise<AdminBooking> {
  return apiRequest<AdminBooking>(
    `/api/admin/bookings/${encodeURIComponent(reference)}/cancel`,
    { method: 'POST', body: JSON.stringify({ reason: reason ?? null }) },
  );
}

export function fetchTables(): Promise<ClubTable[]> {
  return apiRequest<ClubTable[]>('/api/tables');
}

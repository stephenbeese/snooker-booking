import { apiRequest } from '@/lib/apiClient';
import type {
  AdminBooking,
  AdminBookingFilters,
  AdminDashboard,
  AdminTable,
  ClubTable,
  MaintenanceBlock,
  MaintenanceBlockInput,
  Paged,
  TableInput,
  TelephoneBookingInput,
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

/** Every table including inactive ones, plus the staff-only notes field. */
export function fetchAdminTables(): Promise<AdminTable[]> {
  return apiRequest<AdminTable[]>('/api/admin/tables');
}

export function createTable(input: TableInput): Promise<AdminTable> {
  return apiRequest<AdminTable>('/api/admin/tables', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateTable(id: number, input: TableInput): Promise<AdminTable> {
  return apiRequest<AdminTable>(`/api/admin/tables/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

/** Separate from updateTable so taking a table off sale is always deliberate. */
export function setTableActive(id: number, active: boolean): Promise<AdminTable> {
  return apiRequest<AdminTable>(`/api/admin/tables/${id}/active?active=${active}`, {
    method: 'PUT',
  });
}

export function fetchMaintenanceBlocks(
  from: string,
  to: string,
): Promise<MaintenanceBlock[]> {
  return apiRequest<MaintenanceBlock[]>(
    `/api/admin/maintenance-blocks?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
}

export function createMaintenanceBlock(
  input: MaintenanceBlockInput,
): Promise<MaintenanceBlock> {
  return apiRequest<MaintenanceBlock>('/api/admin/maintenance-blocks', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function deleteMaintenanceBlock(id: number): Promise<void> {
  return apiRequest<void>(`/api/admin/maintenance-blocks/${id}`, { method: 'DELETE' });
}

export function createTelephoneBooking(
  input: TelephoneBookingInput,
): Promise<AdminBooking> {
  return apiRequest<AdminBooking>('/api/admin/bookings/telephone', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

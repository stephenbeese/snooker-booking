import { apiRequest } from '@/lib/apiClient';
import type { Role } from '@/features/auth/types';
import type {
  AdminBooking,
  AdminBookingFilters,
  AdminDashboard,
  AdminTable,
  AdminUser,
  AdminUserFilters,
  CreateUserInput,
  BookingRules,
  ClubDetails,
  ClubTable,
  CounterPaymentStatus,
  DayHours,
  MaintenanceBlock,
  MaintenanceBlockInput,
  Paged,
  PricingRule,
  PricingRuleInput,
  SettingsUpdate,
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

/**
 * Records money taken at the counter, or waives it.
 *
 * <p>No amount is sent: the club is owed what the booking costs, and a figure typed here could
 * disagree with the booking it settles.
 */
export function recordCounterPayment(
  reference: string,
  status: CounterPaymentStatus,
): Promise<AdminBooking> {
  return apiRequest<AdminBooking>(
    `/api/admin/bookings/${encodeURIComponent(reference)}/payment`,
    { method: 'POST', body: JSON.stringify({ status }) },
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

// ---------------------------------------------------------------- settings

export function fetchClubDetails(): Promise<ClubDetails> {
  return apiRequest<ClubDetails>('/api/admin/settings/club');
}

export function updateClubDetails(
  input: ClubDetails,
): Promise<SettingsUpdate<ClubDetails>> {
  return apiRequest<SettingsUpdate<ClubDetails>>('/api/admin/settings/club', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function fetchOpeningHours(): Promise<DayHours[]> {
  return apiRequest<DayHours[]>('/api/admin/settings/opening-hours');
}

/** The whole week at once — the server rejects anything less than seven days. */
export function updateOpeningHours(days: DayHours[]): Promise<SettingsUpdate<DayHours[]>> {
  return apiRequest<SettingsUpdate<DayHours[]>>('/api/admin/settings/opening-hours', {
    method: 'PUT',
    body: JSON.stringify({ days }),
  });
}

export function fetchBookingRules(): Promise<BookingRules> {
  return apiRequest<BookingRules>('/api/admin/settings/booking-rules');
}

export function updateBookingRules(
  input: BookingRules,
): Promise<SettingsUpdate<BookingRules>> {
  return apiRequest<SettingsUpdate<BookingRules>>('/api/admin/settings/booking-rules', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function fetchPricingRules(): Promise<PricingRule[]> {
  return apiRequest<PricingRule[]>('/api/admin/settings/pricing-rules');
}

export function savePricingRule(
  id: number | null,
  input: PricingRuleInput,
): Promise<PricingRule> {
  return apiRequest<PricingRule>(
    id === null ? '/api/admin/settings/pricing-rules' : `/api/admin/settings/pricing-rules/${id}`,
    { method: id === null ? 'POST' : 'PUT', body: JSON.stringify(input) },
  );
}

export function deletePricingRule(id: number): Promise<void> {
  return apiRequest<void>(`/api/admin/settings/pricing-rules/${id}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------- accounts

/**
 * The user directory. ADMIN-only server-side; the client filter is a convenience.
 *
 * <p>The search term goes through `URLSearchParams`, so a term containing `&` or `%` is
 * encoded rather than changing the query it lands in. The server escapes LIKE wildcards
 * separately — encoding and escaping solve different problems and both are needed.
 */
export function fetchAdminUsers(
  filters: AdminUserFilters,
): Promise<Paged<AdminUser>> {
  const params = new URLSearchParams();
  if (filters.role) {
    params.set('role', filters.role);
  }
  if (filters.search) {
    params.set('search', filters.search);
  }
  params.set('page', String(filters.page ?? 0));
  return apiRequest<Paged<AdminUser>>(`/api/admin/users?${params.toString()}`);
}

export function createAdminUser(input: CreateUserInput): Promise<AdminUser> {
  return apiRequest<AdminUser>('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify({ ...input, phone: input.phone.trim() }),
  });
}

/** Promoting or demoting. Separate from any other edit so a role change is never incidental. */
export function changeUserRole(id: number, role: Role): Promise<AdminUser> {
  return apiRequest<AdminUser>(`/api/admin/users/${id}/role`, {
    method: 'PUT',
    body: JSON.stringify({ role }),
  });
}

export function setUserActive(id: number, active: boolean): Promise<AdminUser> {
  return apiRequest<AdminUser>(`/api/admin/users/${id}/active?active=${active}`, {
    method: 'PUT',
  });
}

/** Returns nothing: the new password is what the admin already typed, not news from the server. */
export function resetUserPassword(id: number, password: string): Promise<void> {
  return apiRequest<void>(`/api/admin/users/${id}/password`, {
    method: 'PUT',
    body: JSON.stringify({ password }),
  });
}

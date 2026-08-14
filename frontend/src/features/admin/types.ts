import type { BookingStatus } from '@/features/booking/types';
import type { Role } from '@/features/auth/types';

export type BookingSource = 'ONLINE' | 'TELEPHONE' | 'ADMIN';

/**
 * A table type's code, e.g. "SNOOKER".
 *
 * <p>A bare string rather than a union since Phase 7: types are rows a manager can add, so a
 * closed union here would be a second source of truth that a newly added type falsifies —
 * and `Record<TableType, string>` label maps would stop compiling every time the club took
 * up a new format. Labels come from `GET /api/tables/types`.
 */
export type TableType = string;

/** Mirrors the server's `PaymentStatus`. */
export type PaymentStatus =
  | 'REQUIRES_PAYMENT'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED'
  | 'PAID_AT_COUNTER'
  | 'WAIVED';

/** The two outcomes staff may record. Anything else is Stripe's to write. */
export type CounterPaymentStatus = Extract<PaymentStatus, 'PAID_AT_COUNTER' | 'WAIVED'>;

/**
 * A booking as staff see it.
 *
 * <p>Separate from the customer's `Booking` rather than an extension of it: the extra fields
 * are another person's contact details, and a shared type invites passing one where the other
 * is expected.
 */
export interface AdminBooking {
  reference: string;
  tableId: number;
  tableName: string;
  date: string;
  startTime: string;
  endTime: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  pricePence: number;
  status: BookingStatus;
  source: BookingSource;
  holdExpiresAt: string | null;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  notes: string | null;
  cancellable: boolean;
  cancellationBlockedReason: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  /** Null when no payment was ever started — distinct from a zero outstanding amount. */
  paymentStatus: PaymentStatus | null;
  amountOutstandingPence: number;
  /** True when staff must take money as this customer walks in. */
  payableAtCounter: boolean;
}

export interface AdminDashboard {
  date: string;
  bookedToday: number;
  stillToCome: number;
  cancelledToday: number;
  awaitingPayment: number;
  expectedRevenuePence: number;
  paymentExceptions: number;
}

export interface Paged<T> {
  items: T[];
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
}

/** Mirrors the server's query parameters. Every field optional. */
export interface AdminBookingFilters {
  status?: BookingStatus[];
  from?: string;
  to?: string;
  tableId?: number;
  search?: string;
  page?: number;
  size?: number;
}

export interface ClubTable {
  id: number;
  name: string;
  tableType: TableType;
  displayOrder: number;
  active: boolean;
}

/**
 * A table as staff see it.
 *
 * <p>Distinct from `ClubTable` only by `notes`, which is a staff field the public endpoint
 * never returns. Keeping them separate means a component that renders a public table cannot
 * accidentally display it.
 */
export interface AdminTable extends ClubTable {
  notes: string | null;
}

export interface TableInput {
  name: string;
  tableType: TableType;
  displayOrder: number;
  notes?: string | null;
}

export interface MaintenanceBlock {
  id: number;
  tableId: number;
  tableName: string;
  date: string;
  startTime: string;
  endTime: string;
  startAt: string;
  endAt: string;
  reason: string | null;
}

export interface MaintenanceBlockInput {
  tableId: number;
  date: string;
  startTime: string;
  endTime: string;
  reason?: string | null;
}

export type Weekday =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'
  | 'SUNDAY';

export interface ClubDetails {
  name: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postcode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  description: string | null;
}

/**
 * One day's hours as staff edit them.
 *
 * <p>Times are kept even when the day is closed, so reopening restores the previous hours
 * instead of presenting an empty form. The public endpoint nulls them for display.
 */
export interface DayHours {
  day: Weekday;
  closed: boolean;
  openTime: string | null;
  closeTime: string | null;
}

/**
 * Special hours for one date, overriding that date's weekday hours.
 *
 * <p>Times are kept on a closed date for the same reason as {@link DayHours}: reopening it
 * restores what was there rather than presenting an empty form.
 */
export interface DateHours {
  date: string;
  closed: boolean;
  openTime: string | null;
  closeTime: string | null;
  note: string | null;
}

/** A kind of table, as staff manage it. The code is immutable; the label is not. */
export interface AdminTableType {
  code: TableType;
  label: string;
  displayOrder: number;
  active: boolean;
}

export interface BookingRules {
  minDurationMinutes: number;
  maxDurationMinutes: number;
  incrementMinutes: number;
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  cancellationNoticeHours: number;
  paymentHoldMinutes: number;
}

export interface PricingRule {
  id: number;
  name: string;
  tableType: TableType | null;
  /** The days this rule covers. **Empty means every day**, not "no days". */
  daysOfWeek: Weekday[];
  startTime: string | null;
  endTime: string | null;
  hourlyRatePence: number;
  priority: number;
  active: boolean;
  /** True when this rule matches every table at every time — the club's pricing floor. */
  catchAll: boolean;
}

export interface PricingRuleInput {
  name: string;
  tableType?: TableType | null;
  /** Omit or send empty for a rule that applies every day. */
  daysOfWeek?: Weekday[];
  startTime?: string | null;
  endTime?: string | null;
  hourlyRatePence: number;
  priority: number;
  active: boolean;
}

/** A future booking the new settings would not have permitted. Advisory, never blocking. */
export interface SettingsWarning {
  reference: string;
  detail: string;
}

export interface SettingsUpdate<T> {
  settings: T;
  warnings: SettingsWarning[];
}

/** What staff type when taking a booking over the phone. */
export interface TelephoneBookingInput {
  tableId: number;
  date: string;
  startTime: string;
  durationMinutes: number;
  customerEmail: string;
  firstName: string;
  lastName: string;
  customerPhone?: string | null;
  notes?: string | null;
}

/**
 * An account as an admin sees it.
 *
 * <p>No password field in either direction: the hash never leaves the server, and a new
 * password is sent through a dedicated request rather than as part of the account.
 */
export interface AdminUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string | null;
  role: Role;
  active: boolean;
  createdAt: string;
}

/** What an admin types to create an account for someone who works here. */
export interface CreateUserInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: Role;
}

export interface AdminUserFilters {
  role?: Role | undefined;
  search?: string | undefined;
  page?: number | undefined;
}

/**
 * A customer as the counter sees them.
 *
 * <p>No `role`: everything the customers endpoint returns is a customer by construction, so a
 * role here would be a constant pretending to be data.
 */
export interface AdminCustomer {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string | null;
  active: boolean;
  createdAt: string;
  bookingCount: number;
}

/** One customer with their bookings, as the detail endpoint returns them together. */
export interface AdminCustomerDetail {
  customer: AdminCustomer;
  bookings: AdminBooking[];
}

export interface AdminCustomerFilters {
  search?: string | undefined;
  page?: number | undefined;
}

/**
 * Something the club sells at the cafe or bar.
 *
 * <p>`pricePence` is integer pence, as all money here is. Formatted for display at the edge with
 * `formatPence`, never stored or sent as a formatted string.
 */
export interface CafeItem {
  id: number;
  name: string;
  description: string | null;
  pricePence: number;
  imageUrl: string | null;
  displayOrder: number;
  active: boolean;
}

/** `displayOrder` omitted means "put it at the end", which the server decides. */
export interface CafeItemInput {
  name: string;
  description?: string | null;
  pricePence: number;
  imageUrl?: string | null;
  displayOrder?: number | null;
}

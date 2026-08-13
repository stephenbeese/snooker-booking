import type { BookingStatus } from '@/features/booking/types';

export type BookingSource = 'ONLINE' | 'TELEPHONE' | 'ADMIN';

export type TableType = 'SNOOKER' | 'ENGLISH_POOL' | 'AMERICAN_POOL';

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

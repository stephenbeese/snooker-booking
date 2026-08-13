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

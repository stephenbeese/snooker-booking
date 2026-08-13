import type { Booking } from '@/features/booking/types';
import type { DayAvailability, Slot, TableAvailability } from '@/features/availability/types';

export function makeSlot(overrides: Partial<Slot> & { startTime: string }): Slot {
  const hhmm = overrides.startTime.slice(0, 5);
  return {
    startAt: `2026-08-20T${hhmm}:00Z`,
    endTime: '00:00:00',
    available: true,
    reason: null,
    bookableForRequestedDuration: null,
    maxDurationMinutes: 240,
    pricePenceForRequestedDuration: null,
    ...overrides,
  };
}

export function makeTable(overrides: Partial<TableAvailability> = {}): TableAvailability {
  return {
    tableId: 1,
    tableName: 'Table 1',
    tableType: 'SNOOKER',
    tableActive: true,
    hourlyRatePence: 1200,
    slots: [
      makeSlot({ startTime: '10:00:00' }),
      makeSlot({ startTime: '10:30:00' }),
      makeSlot({ startTime: '11:00:00' }),
    ],
    ...overrides,
  };
}

export function makeAvailability(overrides: Partial<DayAvailability> = {}): DayAvailability {
  return {
    date: '2026-08-20',
    dayOfWeek: 'THURSDAY',
    timezone: 'Europe/London',
    clubOpen: true,
    openingTime: '10:00:00',
    closingTime: '23:00:00',
    incrementMinutes: 30,
    slotTimes: ['10:00:00', '10:30:00', '11:00:00'],
    durationOptions: [
      { minutes: 30, label: '30 mins' },
      { minutes: 60, label: '1 hour' },
      { minutes: 90, label: '1 hour 30 mins' },
    ],
    requestedDurationMinutes: null,
    dayUnavailableReason: null,
    tables: [makeTable()],
    ...overrides,
  };
}

/**
 * A booking, defaulting to a confirmed one that may still be cancelled.
 *
 * <p>Shared rather than redefined per test file so that adding a field to the Booking type
 * breaks compilation in exactly one place — which is the point of having tsc check the
 * fixtures at all.
 */
export function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    reference: 'SNK-ABC123',
    tableId: 1,
    tableName: 'Table 1',
    date: '2026-08-20',
    startTime: '19:00:00',
    endTime: '20:00:00',
    startAt: '2026-08-20T18:00:00Z',
    endAt: '2026-08-20T19:00:00Z',
    durationMinutes: 60,
    pricePence: 1200,
    status: 'CONFIRMED',
    holdExpiresAt: null,
    customerName: 'Test Customer',
    notes: null,
    cancellable: true,
    cancellableUntil: '2026-08-19T18:00:00Z',
    cancellationBlockedReason: null,
    cancelledAt: null,
    ...overrides,
  };
}

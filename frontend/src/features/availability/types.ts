/**
 * Mirrors the backend availability contract. Hand-written for now; once the OpenAPI
 * endpoint lands these should be generated so a backend DTO change breaks `tsc`.
 */

export type UnavailableReason =
  | 'CLUB_CLOSED'
  | 'TABLE_INACTIVE'
  | 'MAINTENANCE'
  | 'BOOKED'
  | 'PAST'
  | 'INSUFFICIENT_NOTICE'
  | 'TOO_FAR_IN_ADVANCE'
  | 'INSUFFICIENT_REMAINING_TIME';

export type TableType = 'SNOOKER' | 'ENGLISH_POOL' | 'AMERICAN_POOL';

export interface Slot {
  /** Club-local start, e.g. "14:00:00". Matches the grid's time axis. */
  startTime: string;
  /** Absolute instant, posted back when booking so there is no ambiguity. */
  startAt: string;
  endTime: string;
  /** Is this cell unoccupied? Drives the heat-map. */
  available: boolean;
  reason: UnavailableReason | null;
  /** Can a booking of the requested length start here? Null if no duration asked. */
  bookableForRequestedDuration: boolean | null;
  maxDurationMinutes: number;
  pricePenceForRequestedDuration: number | null;
  /**
   * The rate at this cell. Present on every slot, because a rule narrowed by time of day
   * makes the rate vary across the row — one figure per row would misquote the rest.
   */
  hourlyRatePence: number;
}

export interface TableAvailability {
  tableId: number;
  tableName: string;
  tableType: TableType;
  tableActive: boolean;
  /** The **lowest** rate in this row — a "from" price when `varyingRate` is true. */
  hourlyRatePence: number;
  /** True when the rate changes during the day, so the UI shows a range rather than one price. */
  varyingRate: boolean;
  highestHourlyRatePence: number;
  slots: Slot[];
}

export interface DurationOption {
  minutes: number;
  label: string;
}

export interface DayAvailability {
  date: string;
  dayOfWeek: string;
  timezone: string;
  clubOpen: boolean;
  openingTime: string | null;
  closingTime: string | null;
  incrementMinutes: number;
  /** The column axis, sent once rather than per table. */
  slotTimes: string[];
  /** Server-computed; the client must never derive these itself. */
  durationOptions: DurationOption[];
  requestedDurationMinutes: number | null;
  /** Set when the whole day is unbookable (closed, past, too far ahead). */
  dayUnavailableReason: UnavailableReason | null;
  tables: TableAvailability[];
}

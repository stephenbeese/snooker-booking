/**
 * Every query key in one place. A forgotten dependency here means a stale
 * availability grid, which means users clicking slots that are already gone — so
 * keys are built centrally rather than inline at call sites.
 */
export const queryKeys = {
  health: () => ['health'] as const,

  availability: (date: string, durationMinutes?: number) =>
    ['availability', date, durationMinutes ?? null] as const,

  club: () => ['club'] as const,
  tables: () => ['tables'] as const,
  bookingSettings: () => ['booking-settings'] as const,

  currentUser: () => ['current-user'] as const,
  myBookings: () => ['bookings', 'mine'] as const,
  booking: (reference: string) => ['bookings', reference] as const,

  adminDashboard: () => ['admin', 'dashboard'] as const,
  // The whole filter object is part of the key: two different filters are two different
  // result sets, and sharing a key between them shows the previous filter's rows while the
  // new request is in flight.
  adminBookings: (filters: unknown) => ['admin', 'bookings', filters] as const,
  adminBooking: (reference: string) => ['admin', 'bookings', 'one', reference] as const,
  adminDay: (date: string) => ['admin', 'day', date] as const,
} as const;

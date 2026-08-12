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
} as const;

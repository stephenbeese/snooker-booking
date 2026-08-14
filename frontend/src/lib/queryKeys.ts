/**
 * Every query key in one place. A forgotten dependency here means a stale
 * availability grid, which means users clicking slots that are already gone — so
 * keys are built centrally rather than inline at call sites.
 */
export const queryKeys = {
  health: () => ['health'] as const,

  // `tableIds` is part of the key because it is part of the request. Omitting it made two
  // different table filters share one cache entry, so the staff grid filtered to table 3
  // would be served the answer computed for table 1.
  availability: (date: string, durationMinutes?: number, tableIds?: number[]) =>
    ['availability', date, durationMinutes ?? null, tableIds ?? null] as const,

  // A separate namespace, not a flag on the key above. The staff grid is computed under a
  // different BookingPolicy — notice and advance lifted — so the two answers genuinely
  // differ for the same date, and sharing a cache entry would show one to the other.
  adminAvailability: (date: string, durationMinutes?: number, tableIds?: number[]) =>
    ['admin', 'availability', date, durationMinutes ?? null, tableIds ?? null] as const,

  club: () => ['club'] as const,
  tables: () => ['tables'] as const,
  // The public code→label list every screen renders types with. Separate from adminTableTypes
  // below: this one is readable by anyone and lists only active types, so sharing a key would
  // serve a customer the withdrawn ones.
  tableTypes: () => ['table-types'] as const,
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
  adminTables: () => ['admin', 'tables'] as const,
  // The whole filter object, as with adminBookings: two filters are two result sets, and
  // sharing a key shows the previous filter's rows while the new request is in flight.
  adminUsers: (filters: unknown) => ['admin', 'users', filters] as const,
  // Its own namespace rather than a variant of adminUsers: they are different endpoints with
  // different permissions, and a shared prefix would let one invalidate the other.
  adminCustomers: (filters: unknown) => ['admin', 'customers', filters] as const,
  adminCustomer: (id: number) => ['admin', 'customers', 'one', id] as const,
  adminBlocks: (from: string, to: string) => ['admin', 'blocks', from, to] as const,
  adminClubDetails: () => ['admin', 'settings', 'club'] as const,
  adminOpeningHours: () => ['admin', 'settings', 'opening-hours'] as const,
  adminBookingRules: () => ['admin', 'settings', 'booking-rules'] as const,
  adminPricingRules: () => ['admin', 'settings', 'pricing-rules'] as const,
  adminOpeningHoursOverrides: () => ['admin', 'settings', 'opening-hours', 'overrides'] as const,
  // Every type including withdrawn ones, which only an admin may see — see tableTypes above.
  adminTableTypes: () => ['admin', 'table-types'] as const,
  // The cafe menu. Under the 'admin' prefix like everything else here, but deliberately not
  // invalidated by useInvalidateClubStructure: a price change moves nothing on the availability
  // grid, and sweeping it into that group would refetch the menu every time a table is renamed.
  adminCafeItems: () => ['admin', 'cafe', 'items'] as const,
} as const;

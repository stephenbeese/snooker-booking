/** Mirrors ClubResponse. Public: no account needed to read any of it. */
export interface Club {
  name: string;
  description: string | null;
  contact: ClubContact;
  openingHours: DayHours[];
  /** Cheapest active hourly rate, in pence. */
  fromHourlyRatePence: number;
  minDurationMinutes: number;
  maxAdvanceDays: number;
}

export interface ClubContact {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postcode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
}

export interface DayHours {
  /** ISO weekday, 1 = Monday. The server sends the number; this client names it. */
  dayOfWeek: number;
  closed: boolean;
  /** "10:00:00", or null when closed. */
  openTime: string | null;
  closeTime: string | null;
}

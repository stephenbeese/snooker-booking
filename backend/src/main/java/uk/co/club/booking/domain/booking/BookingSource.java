package uk.co.club.booking.domain.booking;

/** How the booking reached the system. Affects payment handling, never validation. */
public enum BookingSource {
    /** Customer self-service through the SPA. */
    ONLINE,
    /** Taken by staff over the phone. */
    TELEPHONE,
    /** Created by staff in the admin area. */
    ADMIN
}

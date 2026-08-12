package uk.co.club.booking.domain.booking;

/**
 * Which rules a caller is permitted to relax.
 *
 * <p>Staff need to take a booking for "in ten minutes" or for next year, both of which
 * the online rules forbid. That is the entire legitimate difference between an admin
 * booking and a customer one.
 *
 * <p>Note what is <em>absent</em>: there is no flag for skipping the overlap check, the
 * maintenance check or the inactive-table check. Those are not policies an admin may
 * override — they describe the physical world, and a booking that violates them cannot be
 * honoured. Leaving the fields out makes the unsafe combination unrepresentable rather
 * than merely discouraged by a comment.
 *
 * @param enforceMinNotice reject bookings starting sooner than the configured notice
 * @param enforceMaxAdvance reject bookings beyond the configured advance window
 * @param requiresPaymentHold create as PENDING_PAYMENT with a hold expiry, rather than
 *     straight to CONFIRMED
 */
public record BookingPolicy(
        boolean enforceMinNotice, boolean enforceMaxAdvance, boolean requiresPaymentHold) {

    /** A customer booking online: every rule applies, and payment is taken up front. */
    public static BookingPolicy online() {
        return new BookingPolicy(true, true, true);
    }

    /**
     * Staff booking on a customer's behalf. Notice and advance limits are lifted; the slot
     * is committed immediately because a member of staff is standing there, so there is
     * nothing to hold the slot against.
     */
    public static BookingPolicy staff() {
        return new BookingPolicy(false, false, false);
    }
}

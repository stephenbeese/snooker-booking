package uk.co.club.booking.domain.payment;

/**
 * Lifecycle of the money, deliberately separate from {@code BookingStatus}.
 *
 * <p>The slot and the payment are genuinely independent: a CANCELLED booking may hold a
 * SUCCEEDED payment awaiting refund, and a CONFIRMED booking may be unpaid because staff took
 * it over the phone. Collapsing the two into one status, or adding a {@code paid} boolean to
 * the booking, makes those ordinary situations unrepresentable.
 */
public enum PaymentStatus {

    /** Created, awaiting the customer. */
    REQUIRES_PAYMENT,

    /** Handed off to Stripe; the outcome is not yet known. */
    PROCESSING,

    SUCCEEDED,

    /** Declined. The hold survives so the customer can retry within its TTL. */
    FAILED,

    REFUNDED,
    PARTIALLY_REFUNDED,

    /** Cash or card at the counter, recorded by staff. */
    PAID_AT_COUNTER,

    /** Comped by the club. */
    WAIVED;

    /** Whether the club has the money. */
    public boolean isSettled() {
        return this == SUCCEEDED || this == PAID_AT_COUNTER || this == WAIVED;
    }
}

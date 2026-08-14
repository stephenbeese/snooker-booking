package uk.co.club.booking.domain.payment;

import java.util.Collection;
import java.util.Comparator;

/**
 * The state of one booking's money, as staff need to act on it.
 *
 * <p>A booking may have several payment rows — a declined card then a successful retry, or a
 * counter payment recorded against a booking that was first attempted online. Deciding which of
 * them "the" payment status is belongs here rather than in a DTO, so the list, the detail page
 * and any future report cannot each pick a different one and disagree on screen.
 *
 * @param status the payment that speaks for the booking, or null when none was ever created
 * @param outstandingPence what the club is still owed; zero once settled
 * @param provider how it is being taken — {@code COUNTER} is the one staff must act on
 */
public record PaymentSummary(PaymentStatus status, int outstandingPence, String provider) {

    /** Bookings created before payments existed, and online holds not yet handed to Stripe. */
    public static final PaymentSummary NONE = new PaymentSummary(null, 0, null);

    /**
     * Picks the payment that speaks for a booking.
     *
     * <p>A settled payment always wins, however old: once the club has the money, a later failed
     * retry does not un-take it. Failing that, the newest attempt is the current state of play.
     *
     * @param attempts every payment for one booking, in any order
     * @param pricePence what the booking costs, used for the outstanding figure
     */
    public static PaymentSummary of(Collection<Payment> attempts, int pricePence) {
        if (attempts.isEmpty()) {
            return NONE;
        }

        Payment speaking = attempts.stream()
                .filter(payment -> payment.getStatus().isSettled())
                .findFirst()
                .orElseGet(() -> attempts.stream()
                        .max(Comparator.comparing(Payment::getId))
                        .orElseThrow());

        return new PaymentSummary(
                speaking.getStatus(),
                speaking.getStatus().isSettled() ? 0 : pricePence,
                speaking.getProvider());
    }

    /** Whether staff need to take money when this customer arrives. */
    public boolean dueAtCounter() {
        return "COUNTER".equals(provider) && status != null && !status.isSettled();
    }
}

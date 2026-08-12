package uk.co.club.booking.domain.payment;

/**
 * The payment provider, behind an interface.
 *
 * <p>Normally a single-implementation interface would be over-engineering. It earns its place
 * here for one reason: without it, every test of the booking-and-payment flow would have to
 * make a real network call to Stripe. That makes the suite slow, flaky, dependent on someone's
 * API key, and impossible to run offline — so the payment paths would end up being the least
 * tested code in a system that handles money.
 *
 * <p>It is deliberately narrow. No attempt at a general "payment provider abstraction": the
 * two methods here are what the booking flow actually needs, and anything more would be
 * inventing requirements.
 */
public interface CheckoutGateway {

    /**
     * Creates a hosted Checkout session for a booking.
     *
     * @param idempotencyKey makes a retried call return the original session instead of
     *     charging twice. The booking reference is used, so a network timeout followed by a
     *     retry cannot produce two payments for one booking.
     */
    CheckoutSession createSession(CheckoutRequest request, String idempotencyKey);

    /**
     * Expires a session so an abandoned checkout cannot be paid after its hold has lapsed.
     *
     * <p>Best-effort: the session may already be complete or expired, which is not an error.
     */
    void expireSession(String sessionId);

    /** What the club needs Stripe to collect. */
    record CheckoutRequest(
            String bookingReference,
            long bookingId,
            String description,
            int amountPence,
            String currency,
            String customerEmail,
            String successUrl,
            String cancelUrl) {}

    /** What the caller needs back: where to send the customer, and what to record. */
    record CheckoutSession(String sessionId, String url, String paymentIntentId) {}
}

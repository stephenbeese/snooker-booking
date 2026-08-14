package uk.co.club.booking.domain.payment;

import java.util.Optional;

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

    /**
     * Asks the provider what actually became of a session.
     *
     * <p>Exists because the webhook is not guaranteed to arrive. Without a way to ask, a
     * payment that succeeded at Stripe but whose {@code checkout.session.completed} was
     * delayed, dropped or never forwarded leaves the booking looking unpaid — and the customer
     * is then offered a second checkout for money they have already handed over.
     *
     * @return empty when the session cannot be read, which is treated as "unknown" rather than
     *     as "unpaid": guessing unpaid is what takes the money twice.
     */
    Optional<SessionState> fetchSession(String sessionId);

    /**
     * A session as the provider currently sees it.
     *
     * @param paid whether the money has actually been taken
     * @param open whether the customer could still pay this session, so it can be reused
     *     instead of a second payable session being created alongside it
     */
    record SessionState(
            String sessionId, boolean paid, boolean open, String url, String paymentIntentId) {}

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

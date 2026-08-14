package uk.co.club.booking.support;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import uk.co.club.booking.domain.payment.CheckoutGateway;

/**
 * An in-memory stand-in for Stripe.
 *
 * <p>Integration tests need the booking-and-payment flow to run end to end without a network
 * call: real calls would make the suite slow, flaky, dependent on somebody's API key, and
 * unrunnable offline — which in practice means the money-handling paths end up the least tested
 * code in the system.
 *
 * <p>Records what it was asked to do so tests can assert on it, notably that a session is
 * expired when a hold is swept, and that a second payable session is never created for a
 * booking that has already been paid.
 */
public class StubCheckoutGateway implements CheckoutGateway {

    private final AtomicInteger counter = new AtomicInteger();
    private final List<CheckoutRequest> created = new ArrayList<>();
    private final List<String> expired = new ArrayList<>();
    private final List<String> idempotencyKeys = new ArrayList<>();
    private final List<Refunded> refunds = new ArrayList<>();

    /**
     * What each session looks like when asked about, keyed by session id.
     *
     * <p>Modelled rather than assumed, because the double-charge guard turns entirely on this
     * answer: a stub that always reported "open and unpaid" would let a second session be
     * created and the test would pass against the very bug it exists to catch.
     */
    private final Map<String, SessionState> sessions = new HashMap<>();

    /** When set, createSession throws instead — for testing the provider-failure path. */
    private volatile RuntimeException failure;

    /** When true, fetchSession reports "cannot tell" — an unreachable Stripe. */
    private volatile boolean fetchUnavailable;

    /** When true, refund reports that it could not be done. */
    private volatile boolean refundUnavailable;

    /** How far short of the asked-for amount a refund comes back, for the partial case. */
    private volatile int refundShortfallPence;

    @Override
    public synchronized CheckoutSession createSession(
            CheckoutRequest request, String idempotencyKey) {
        if (failure != null) {
            throw failure;
        }
        created.add(request);
        idempotencyKeys.add(idempotencyKey);
        int n = counter.incrementAndGet();
        String sessionId = "cs_test_" + n;
        String url = "https://checkout.stripe.test/pay/" + sessionId;
        // A newly created session is open and unpaid, exactly as at Stripe.
        sessions.put(sessionId, new SessionState(sessionId, false, true, url, "pi_test_" + n));
        return new CheckoutSession(sessionId, url, "pi_test_" + n);
    }

    @Override
    public synchronized void expireSession(String sessionId) {
        expired.add(sessionId);
        sessions.computeIfPresent(
                sessionId,
                (id, state) -> new SessionState(
                        id, state.paid(), false, state.url(), state.paymentIntentId()));
    }

    @Override
    public synchronized Optional<SessionState> fetchSession(String sessionId) {
        if (fetchUnavailable) {
            return Optional.empty();
        }
        return Optional.ofNullable(sessions.get(sessionId));
    }

    @Override
    public synchronized Optional<RefundResult> refund(
            String paymentIntentId, int amountPence, String idempotencyKey) {
        refunds.add(new Refunded(paymentIntentId, amountPence, idempotencyKey));
        if (refundUnavailable) {
            return Optional.empty();
        }
        return Optional.of(new RefundResult(
                "re_test_" + counter.incrementAndGet(), amountPence - refundShortfallPence));
    }

    /**
     * Makes refund report that it could not be done.
     *
     * <p>The case that matters most: the club owed the money, the provider did not send it, and
     * the cancellation has already happened. Something must still raise that for a human.
     */
    public void makeRefundUnavailable() {
        this.refundUnavailable = true;
    }

    /** Refunds less than asked, so the partial-refund branch can be exercised. */
    public void refundShortBy(int pence) {
        this.refundShortfallPence = pence;
    }

    public synchronized List<Refunded> refunds() {
        return List.copyOf(refunds);
    }

    /** One call to {@link #refund}, for asserting what the club actually asked Stripe to do. */
    public record Refunded(String paymentIntentId, int amountPence, String idempotencyKey) {}

    /**
     * Marks a session paid at the provider without telling the application.
     *
     * <p>This is the situation the double-charge guard exists for: the money is taken but the
     * confirming webhook never arrives, so the booking still reads as awaiting payment.
     */
    public synchronized void markPaidAtProviderOnly(String sessionId) {
        sessions.put(sessionId, withState(sessionId, true, false));
    }

    /**
     * Lapses a session at the provider, as Stripe does after its own timeout.
     *
     * <p>Deliberately does not record an expiry call, unlike {@link #expireSession}. A test that
     * arranges "this session is dead" through the recording method cannot then assert that the
     * application expired it — its own setup already put the id in the list, so the assertion
     * holds whether or not the production code did anything. The first version of that test was
     * written the wrong way round and survived deleting the code it was meant to protect.
     */
    public synchronized void lapseSession(String sessionId) {
        sessions.put(sessionId, withState(sessionId, false, false));
    }

    private SessionState withState(String sessionId, boolean paid, boolean open) {
        SessionState state = sessions.get(sessionId);
        if (state == null) {
            throw new IllegalArgumentException("No such stub session: " + sessionId);
        }
        return new SessionState(sessionId, paid, open, state.url(), state.paymentIntentId());
    }

    /** Makes fetchSession report that the provider could not be reached. */
    public void makeFetchUnavailable() {
        this.fetchUnavailable = true;
    }

    public synchronized List<CheckoutRequest> created() {
        return List.copyOf(created);
    }

    public synchronized List<String> expiredSessions() {
        return List.copyOf(expired);
    }

    public synchronized List<String> idempotencyKeys() {
        return List.copyOf(idempotencyKeys);
    }

    public void failWith(RuntimeException exception) {
        this.failure = exception;
    }

    public synchronized void reset() {
        created.clear();
        expired.clear();
        idempotencyKeys.clear();
        refunds.clear();
        // Both of these too: a session left paid, or a fetch left unavailable, would leak into
        // the next test as a booking that mysteriously refuses to start a checkout.
        sessions.clear();
        failure = null;
        fetchUnavailable = false;
        refundUnavailable = false;
        refundShortfallPence = 0;
    }

    /**
     * Replaces the real gateway. {@code @Primary} rather than {@code @MockitoBean} so the stub
     * keeps its recorded state across the calls within one test.
     */
    @TestConfiguration
    public static class Config {

        @Bean
        @Primary
        public StubCheckoutGateway stubCheckoutGateway() {
            return new StubCheckoutGateway();
        }
    }
}

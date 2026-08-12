package uk.co.club.booking.support;

import java.util.ArrayList;
import java.util.List;
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
 * expired when a hold is swept.
 */
public class StubCheckoutGateway implements CheckoutGateway {

    private final AtomicInteger counter = new AtomicInteger();
    private final List<CheckoutRequest> created = new ArrayList<>();
    private final List<String> expired = new ArrayList<>();
    private final List<String> idempotencyKeys = new ArrayList<>();

    /** When set, createSession throws instead — for testing the provider-failure path. */
    private volatile RuntimeException failure;

    @Override
    public synchronized CheckoutSession createSession(
            CheckoutRequest request, String idempotencyKey) {
        if (failure != null) {
            throw failure;
        }
        created.add(request);
        idempotencyKeys.add(idempotencyKey);
        int n = counter.incrementAndGet();
        return new CheckoutSession(
                "cs_test_" + n, "https://checkout.stripe.test/pay/cs_test_" + n, "pi_test_" + n);
    }

    @Override
    public synchronized void expireSession(String sessionId) {
        expired.add(sessionId);
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
        failure = null;
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

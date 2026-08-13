package uk.co.club.booking.common.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.TestRestTemplate;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureTestRestTemplate;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.TestPropertySource;
import uk.co.club.booking.support.AbstractIntegrationTest;
import uk.co.club.booking.support.HttpClient;
import uk.co.club.booking.support.IntegrationFixtures;

/**
 * Proves the limiter actually engages through the real filter chain.
 *
 * <p>{@link RateLimiterTest} covers the window arithmetic. This covers the wiring, which is
 * where the failures that matter live: a filter registered in the wrong position, a body
 * consumed before the controller can read it, or a limiter that is silently disabled. Every
 * one of those leaves the unit tests green.
 *
 * <p>The suite disables rate limiting globally (see {@code application-test.yml}); this class
 * turns it back on for its own context.
 */
@TestPropertySource(properties = "app.rate-limit.enabled=true")
@AutoConfigureTestRestTemplate
class RateLimitIT extends AbstractIntegrationTest {

    private static final String PASSWORD = "Password123!";

    @Autowired private TestRestTemplate rest;
    @Autowired private IntegrationFixtures fixtures;
    @Autowired private RateLimitFilter filter;

    /**
     * The limiters live in a filter bean that outlives each test method, so every test in this
     * class draws on the same per-IP quota — they all arrive from 127.0.0.1. Without this
     * reset the tests pass or fail depending on the order JUnit happens to run them in, which
     * is the worst kind of green: it holds until someone adds a test.
     */
    @BeforeEach
    void resetLimiters() {
        filter.resetForTesting();
    }

    @Test
    void repeatedFailedLoginsAreEventuallyRefused() {
        fixtures.aCustomer("throttled@example.test", PASSWORD);
        HttpClient client = browser();

        // The per-IP limit is 10/min. Ten wrong passwords should be rejected as bad
        // credentials; the eleventh should not reach the authentication machinery at all.
        int lastStatus = 0;
        for (int attempt = 1; attempt <= 10; attempt++) {
            lastStatus = post(client, "throttled@example.test", "WrongPassword!");
            assertThat(lastStatus)
                    .as("attempt %d should be a normal credential rejection", attempt)
                    .isEqualTo(422);
        }

        ResponseEntity<String> blocked = client.post(
                "/api/auth/login",
                Map.of("email", "throttled@example.test", "password", "WrongPassword!"),
                String.class);

        assertThat(blocked.getStatusCode().value()).isEqualTo(429);
        assertThat(blocked.getBody()).contains("TOO_MANY_REQUESTS");
        // Without Retry-After the client has no way to know when to try again, and a
        // well-behaved one will simply keep hammering.
        assertThat(blocked.getHeaders().getFirst("Retry-After"))
                .as("Retry-After tells the client when to come back")
                .isNotNull();
        // The message must not distinguish the per-IP limit from the per-account one:
        // saying which tripped would confirm whether the account exists.
        assertThat(blocked.getBody()).doesNotContain("account").doesNotContain("throttled@");
    }

    @Test
    void theRequestBodyStillReachesTheController() {
        // The filter reads the body to find the email. A servlet body can only be read once,
        // so getting this wrong makes *every* login fail with a validation error while the
        // rate-limit tests above still pass. This is the regression test for that.
        fixtures.aCustomer("reader@example.test", PASSWORD);

        ResponseEntity<String> response = browser()
                .post(
                        "/api/auth/login",
                        Map.of("email", "reader@example.test", "password", PASSWORD),
                        String.class);

        assertThat(response.getStatusCode().value())
                .as("a valid login must still succeed with the filter in the chain")
                .isEqualTo(200);
        assertThat(response.getBody()).contains("reader@example.test");
    }

    @Test
    void aSuccessfulLoginClearsTheAccountsFailureHistory() {
        // Otherwise a user who mistypes their password a few times, gets in, and logs out is
        // locked out of their own account for the rest of the window.
        fixtures.aCustomer("forgetful@example.test", PASSWORD);
        HttpClient client = browser();

        for (int attempt = 0; attempt < 3; attempt++) {
            post(client, "forgetful@example.test", "WrongPassword!");
        }

        assertThat(post(client, "forgetful@example.test", PASSWORD))
                .as("the correct password still works after a few misses")
                .isEqualTo(200);

        // The per-account counter is now clear. The per-IP counter is deliberately not, so
        // this asserts only what the clearing is meant to achieve.
        assertThat(post(client, "forgetful@example.test", PASSWORD)).isEqualTo(200);
    }

    @Test
    void forgotPasswordIsThrottledHarderThanLogin() {
        // Every request to this endpoint sends an email. Unthrottled, it is a way to make the
        // club's mail server deliver arbitrary volumes of mail to an address of the
        // attacker's choosing.
        //
        // Three, not five: the per-recipient limit (3/hour) is tighter than the per-IP one
        // (5/hour), and it is the per-recipient limit that decides how much mail one victim
        // can be made to receive — which is the abuse being prevented.
        HttpClient client = browser();

        for (int attempt = 1; attempt <= 3; attempt++) {
            ResponseEntity<String> response = client.post(
                    "/api/auth/forgot-password",
                    Map.of("email", "victim@example.test"),
                    String.class);
            assertThat(response.getStatusCode().value())
                    .as("attempt %d — always 202, registered or not", attempt)
                    .isEqualTo(202);
        }

        ResponseEntity<String> blocked = client.post(
                "/api/auth/forgot-password",
                Map.of("email", "victim@example.test"),
                String.class);

        assertThat(blocked.getStatusCode().value()).isEqualTo(429);
    }

    private int post(HttpClient client, String email, String password) {
        return client.post(
                        "/api/auth/login",
                        Map.of("email", email, "password", password),
                        String.class)
                .getStatusCode()
                .value();
    }

    /**
     * A client holding a CSRF token, as a browser would after loading the page.
     *
     * <p>Without the priming GET every POST is a 403 from the CSRF filter before the rate
     * limiter is reached, and the test proves nothing about throttling.
     */
    private HttpClient browser() {
        HttpClient client = HttpClient.anonymous(rest);
        client.get("/api/auth/me", String.class);
        return client;
    }
}

package uk.co.club.booking.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.TestRestTemplate;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureTestRestTemplate;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.TestPropertySource;
import uk.co.club.booking.support.AbstractIntegrationTest;
import uk.co.club.booking.support.HttpClient;

/**
 * The security properties of a response, rather than of a decision.
 *
 * <p>{@link AuthorizationBoundaryIT} covers who may call what. This covers the headers and
 * cookie flags that decide how safely the answer travels — the kind of setting that is easy to
 * configure once, never look at again, and quietly lose in a refactor. None of it is visible in
 * the UI, so nothing else in the suite would notice.
 */
@TestPropertySource(properties = "spring.servlet.session.cookie.secure=true")
@AutoConfigureTestRestTemplate
class SecurityHeadersIT extends AbstractIntegrationTest {

    @Autowired private TestRestTemplate rest;

    @Test
    void responsesCarryTheClickjackingAndSniffingDefences() {
        HttpHeaders headers = HttpClient.anonymous(rest).get("/api/club", String.class).getHeaders();

        // Without DENY the admin screens can be framed by another site and clicks stolen.
        assertThat(headers.getFirst("X-Frame-Options")).isEqualTo("DENY");
        // Stops a browser second-guessing Content-Type and running a JSON response as script.
        assertThat(headers.getFirst("X-Content-Type-Options")).isEqualTo("nosniff");
        // Authenticated responses must not sit in a shared cache.
        assertThat(headers.getFirst("Cache-Control")).contains("no-store");
    }

    @Test
    void everyCookieTheAppSetsIsSecure() {
        // The CSRF cookie is created by CookieCsrfTokenRepository rather than by the servlet
        // config, so it does not inherit the session cookie's flags. It was the one cookie
        // being set without Secure, which put a valid token in clear text on any plain-HTTP
        // request to the domain.
        ResponseEntity<String> response =
                HttpClient.anonymous(rest).get("/api/auth/me", String.class);

        List<String> cookies = response.getHeaders().get(HttpHeaders.SET_COOKIE);
        assertThat(cookies).as("the CSRF cookie should be issued eagerly").isNotEmpty();

        for (String cookie : cookies) {
            assertThat(cookie)
                    .as("cookie without Secure: %s", cookie.split("=", 2)[0])
                    .containsIgnoringCase("Secure");
            assertThat(cookie)
                    .as("cookie without SameSite: %s", cookie.split("=", 2)[0])
                    .containsIgnoringCase("SameSite");
        }
    }

    @Test
    void theSessionCookieIsHttpOnlyButTheCsrfCookieIsNot() {
        // Deliberately different, and worth pinning. The session cookie must be unreadable to
        // JavaScript; the CSRF cookie must be readable, because the SPA has to echo it back in
        // a header. Making the CSRF cookie HttpOnly silently breaks every write in the app.
        HttpClient client = HttpClient.anonymous(rest);
        client.get("/api/auth/me", String.class);

        List<String> cookies =
                client.get("/api/auth/me", String.class).getHeaders().get(HttpHeaders.SET_COOKIE);
        if (cookies == null) {
            return; // Already held both cookies; nothing re-issued.
        }
        for (String cookie : cookies) {
            if (cookie.startsWith("XSRF-TOKEN=")) {
                assertThat(cookie).doesNotContainIgnoringCase("HttpOnly");
            }
        }
    }

    @Test
    void errorResponsesNeverCarryAStackTrace() {
        // A stack trace names internal classes, library versions and sometimes SQL. The rule
        // is enforced by GlobalExceptionHandler and by server.error.include-stacktrace, and
        // this asserts the result rather than the settings.
        ResponseEntity<String> response = HttpClient.anonymous(rest)
                .get("/api/availability?date=not-a-date", String.class);

        assertThat(response.getStatusCode().value()).isEqualTo(400);
        assertThat(response.getBody())
                .doesNotContain("uk.co.club.booking")
                .doesNotContain("java.lang")
                .doesNotContain("Exception")
                .doesNotContain("at org.springframework");
        // It must still be usable: a code the client can switch on, and a readable message.
        assertThat(response.getBody()).contains("INVALID_REQUEST");
    }

    @Test
    void aFailedLoginRevealsNothingAboutWhetherTheAccountExists() {
        fixturesUser();
        HttpClient client = HttpClient.anonymous(rest);
        client.get("/api/auth/me", String.class);

        ResponseEntity<String> wrongPassword = client.post(
                "/api/auth/login",
                Map.of("email", "real@example.test", "password", "WrongPassword!"),
                String.class);
        ResponseEntity<String> noSuchAccount = client.post(
                "/api/auth/login",
                Map.of("email", "ghost@example.test", "password", "WrongPassword!"),
                String.class);

        // Identical status and identical body. Any difference turns the endpoint into a
        // membership oracle for anyone holding a list of addresses.
        assertThat(wrongPassword.getStatusCode()).isEqualTo(noSuchAccount.getStatusCode());
        assertThat(stripTraceId(wrongPassword.getBody()))
                .isEqualTo(stripTraceId(noSuchAccount.getBody()));
    }

    @Autowired private uk.co.club.booking.support.IntegrationFixtures fixtures;

    private void fixturesUser() {
        fixtures.aCustomer("real@example.test", "Password123!");
    }

    /** The traceId is a fresh random value per response and is not part of the comparison. */
    private String stripTraceId(String body) {
        return body == null ? "" : body.replaceAll("\"traceId\":\"[^\"]*\"", "");
    }
}

package uk.co.club.booking.common.web;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.TestRestTemplate;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureTestRestTemplate;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.TestPropertySource;
import uk.co.club.booking.support.AbstractIntegrationTest;
import uk.co.club.booking.support.HttpClient;

/**
 * Proves the OpenAPI document actually generates.
 *
 * <p>Worth a test rather than a manual check because springdoc still uses Jackson 2 internally
 * while Spring Boot 4 has moved to Jackson 3, so both are on the classpath. If that ever
 * conflicts, the failure is a runtime error when someone opens the URL — nothing else in the
 * suite touches this code path, and the build stays green.
 *
 * <p>The suite disables the documents (see {@code application.yml}); this class enables them
 * for its own context, which also exercises the conditional allowlist in {@code SecurityConfig}.
 */
@TestPropertySource(properties = {
    "springdoc.api-docs.enabled=true",
    "springdoc.swagger-ui.enabled=true"
})
@AutoConfigureTestRestTemplate
class OpenApiDocumentIT extends AbstractIntegrationTest {

    @Autowired private TestRestTemplate rest;

    @Test
    void theDocumentGeneratesAndDescribesTheRealApi() {
        ResponseEntity<String> response =
                HttpClient.anonymous(rest).get("/v3/api-docs", String.class);

        assertThat(response.getStatusCode().value())
                .as("the document must be reachable when enabled")
                .isEqualTo(200);

        String document = response.getBody();
        assertThat(document).isNotNull();
        assertThat(document).contains("Snooker Club Booking API");

        // Spot-check across the surface rather than one endpoint: springdoc failing to scan
        // a whole controller is a far more likely failure than the document being absent.
        assertThat(document)
                .as("public, customer and admin endpoints should all be described")
                .contains("/api/availability")
                .contains("/api/bookings")
                .contains("/api/admin/bookings")
                .contains("/api/admin/settings/opening-hours");
    }

    @Test
    void theDocumentDoesNotExposeSecrets() {
        // The document is generated from real configuration, so it is worth asserting that
        // nothing sensitive has been swept into it — a Stripe key in a schema example would
        // be published to anyone who can read the docs.
        String document = HttpClient.anonymous(rest).get("/v3/api-docs", String.class).getBody();

        assertThat(document)
                .doesNotContain("sk_test")
                .doesNotContain("sk_live")
                .doesNotContain("whsec_")
                .doesNotContain("password_hash");
    }
}

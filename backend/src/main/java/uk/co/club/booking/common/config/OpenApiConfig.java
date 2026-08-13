package uk.co.club.booking.common.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Describes the API for the generated OpenAPI document.
 *
 * <p>The document itself is derived from the controllers and DTOs, not written by hand, so it
 * cannot drift from the code. This class supplies only what cannot be inferred: what the API
 * is, and how callers authenticate.
 *
 * <p>Exposure is profile-gated — see {@code springdoc.api-docs.enabled} in the profile YAMLs.
 * A public {@code /v3/api-docs} hands an attacker a complete, accurate map of every endpoint
 * and every field, including the admin surface. That is a real reduction in the work required
 * to find something, for no benefit to a customer who will never read it.
 */
@Configuration
public class OpenApiConfig {

    @Bean
    OpenAPI bookingApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("Snooker Club Booking API")
                        .version("v1")
                        .description(
                                """
                                Booking and club management for a single snooker club.

                                Authentication is a session cookie, established by
                                POST /api/auth/login. Every state-changing request must also
                                carry the CSRF token from the XSRF-TOKEN cookie in an
                                X-XSRF-TOKEN header — the one exception is the Stripe webhook,
                                which is authenticated by HMAC signature instead.

                                Errors share one envelope: a machine-readable `code`, a
                                displayable `message`, optional per-field `fieldErrors`, and a
                                `traceId` that correlates with the server log. 400 is a
                                malformed request, 422 a business rule, 409 a lost race for a
                                slot, 429 a rate limit.
                                """))
                .components(new Components()
                        .addSecuritySchemes(
                                "session",
                                new SecurityScheme()
                                        .type(SecurityScheme.Type.APIKEY)
                                        .in(SecurityScheme.In.COOKIE)
                                        .name("SESSION")
                                        .description(
                                                "Session cookie issued by POST /api/auth/login.")));
    }
}

package uk.co.club.booking.domain.payment;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Stripe credentials, supplied by environment variables and never committed.
 *
 * @param secretKey server-side key; must never reach the browser or a log
 * @param publishableKey safe to expose to the browser
 * @param webhookSecret HMAC signing secret from {@code stripe listen} or the dashboard;
 *     without it any caller could POST a fake "payment succeeded" event
 */
@ConfigurationProperties(prefix = "stripe")
public record StripeProperties(String secretKey, String publishableKey, String webhookSecret) {

    public StripeProperties {
        // Fail at startup rather than at the first customer's checkout. A blank webhook secret
        // in particular would leave the confirmation endpoint accepting unsigned events.
        if (isBlank(secretKey) || isBlank(publishableKey) || isBlank(webhookSecret)) {
            throw new IllegalStateException(
                    "Stripe configuration is incomplete. Set STRIPE_SECRET_KEY, "
                            + "STRIPE_PUBLISHABLE_KEY and STRIPE_WEBHOOK_SECRET.");
        }
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    /** Guards against a live key in a non-production environment. */
    public boolean isTestMode() {
        return secretKey.startsWith("sk_test_");
    }
}

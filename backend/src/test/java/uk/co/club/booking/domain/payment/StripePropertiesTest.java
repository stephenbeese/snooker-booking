package uk.co.club.booking.domain.payment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

/** The startup guard that must stop the app when Stripe configuration is missing. */
class StripePropertiesTest {

    @Test
    void rejectsAnUnresolvedPlaceholder() {
        // The regression this exists for: an unset environment variable does not arrive as
        // null or "". Spring leaves the placeholder unresolved and the value is the literal
        // "${STRIPE_WEBHOOK_SECRET}". That is not blank, so it passed the original check and
        // the application started with no webhook secret at all — the webhook endpoint served
        // requests, verifying signatures against that literal string. Fail fast instead.
        assertThatThrownBy(
                        () ->
                                new StripeProperties(
                                        "sk_test_x", "pk_test_x", "${STRIPE_WEBHOOK_SECRET}"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Stripe configuration is incomplete");
    }

    @Test
    void rejectsBlankAndNullValues() {
        assertThatThrownBy(() -> new StripeProperties("sk_test_x", "pk_test_x", "  "))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new StripeProperties("sk_test_x", null, "whsec_x"))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void acceptsAFullyConfiguredSetOfTestKeys() {
        assertThatCode(() -> new StripeProperties("sk_test_x", "pk_test_x", "whsec_x"))
                .doesNotThrowAnyException();
        assertThat(new StripeProperties("sk_test_x", "pk_test_x", "whsec_x").isTestMode()).isTrue();
    }
}

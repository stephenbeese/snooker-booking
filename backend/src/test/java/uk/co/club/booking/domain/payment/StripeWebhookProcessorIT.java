package uk.co.club.booking.domain.payment;

import static org.assertj.core.api.Assertions.assertThat;

import com.stripe.model.Event;
import com.stripe.net.Webhook;
import java.nio.charset.StandardCharsets;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import uk.co.club.booking.support.AbstractIntegrationTest;

/**
 * The webhook processor against a real database.
 *
 * <p>Exists because of a bug that reached a live payment: {@code webhook_event_log.payload} is
 * {@code jsonb}, but the entity bound it as a {@code varchar}, so Postgres rejected the insert
 * on the very first line of {@code process(...)}. Every webhook failed, no payment could ever be
 * confirmed, and the whole suite stayed green — the payment tests call {@code PaymentService}
 * directly and never insert an event.
 *
 * <p>The controller deliberately answers 200 even when processing throws (a non-2xx makes Stripe
 * retry for days on a permanently bad event), so a failure here is invisible from the outside.
 * That makes an integration test the only place this can be caught.
 */
class StripeWebhookProcessorIT extends AbstractIntegrationTest {

    /** Matches {@code stripe.webhook-secret} in application-test.yml. */
    private static final String SECRET = "whsec_dummy_secret_for_integration_tests";

    @Autowired private StripeWebhookProcessor processor;
    @Autowired private WebhookEventRepository webhookEventRepository;

    @Test
    @DisplayName("an event is recorded, jsonb payload and all")
    void recordsTheEvent() throws Exception {
        String payload = eventJson("evt_test_recorded");

        processor.process(signedEvent(payload), payload);

        assertThat(webhookEventRepository.findById("evt_test_recorded"))
                .as("the event must be persisted; a varchar-into-jsonb bind fails here")
                .isPresent();
    }

    @Test
    @DisplayName("a redelivered event is a no-op, not a second confirmation")
    void redeliveryIsIgnored() throws Exception {
        String payload = eventJson("evt_test_replayed");
        Event event = signedEvent(payload);

        processor.process(event, payload);
        processor.process(event, payload);

        assertThat(webhookEventRepository.count()).isEqualTo(1);
    }

    /**
     * Parses the payload the way the controller does — through signature verification — rather
     * than constructing an Event by hand, so the test exercises the real entry point.
     */
    private static Event signedEvent(String payload) throws Exception {
        long timestamp = 1700000000L;
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        byte[] digest =
                mac.doFinal((timestamp + "." + payload).getBytes(StandardCharsets.UTF_8));
        StringBuilder hex = new StringBuilder(digest.length * 2);
        for (byte b : digest) {
            hex.append(String.format("%02x", b));
        }
        String header = "t=%d,v1=%s".formatted(timestamp, hex);
        // Tolerance 0 disables the replay-window check; the fixed timestamp is long past.
        return Webhook.constructEvent(payload, header, SECRET, 0);
    }

    /**
     * A minimal but structurally real Stripe event. Deliberately not a hand-built object: the
     * payload must be genuine JSON, because that is what gets bound into the jsonb column.
     */
    private static String eventJson(String id) {
        return """
        {
          "id": "%s",
          "object": "event",
          "type": "checkout.session.completed",
          "api_version": "2024-06-20",
          "created": 1700000000,
          "data": {
            "object": {
              "id": "cs_test_%s",
              "object": "checkout.session",
              "payment_status": "unpaid",
              "status": "open",
              "metadata": {}
            }
          }
        }
        """
                .formatted(id, id);
    }
}

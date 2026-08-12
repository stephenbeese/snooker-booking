package uk.co.club.booking.domain.payment.web;

import com.stripe.exception.SignatureVerificationException;
import com.stripe.model.Event;
import com.stripe.net.Webhook;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import uk.co.club.booking.domain.payment.StripeProperties;
import uk.co.club.booking.domain.payment.StripeWebhookProcessor;

/**
 * Receives Stripe events.
 *
 * <p>Public and CSRF-exempt, because Stripe cannot present a session cookie or a CSRF token.
 * The HMAC signature is the authentication here, and it is stronger than either: only someone
 * holding the webhook secret can produce a valid one.
 */
@RestController
public class StripeWebhookController {

    private static final Logger log = LoggerFactory.getLogger(StripeWebhookController.class);

    private final StripeProperties properties;
    private final StripeWebhookProcessor processor;

    public StripeWebhookController(StripeProperties properties, StripeWebhookProcessor processor) {
        this.properties = properties;
        this.processor = processor;
    }

    /**
     * Handles one event.
     *
     * <p>The body is bound as a raw {@link String}, never as a DTO. Binding to an object would
     * make Jackson parse and re-serialise the JSON, and the signature is computed over the exact
     * bytes Stripe sent — any change in key order or whitespace invalidates it. This is the
     * single most common way Stripe webhook verification is broken.
     *
     * <p>Always returns 200 once the signature is valid, even if processing failed. A non-2xx
     * makes Stripe retry, which is right for a transient fault but wrong for a permanently
     * malformed event: that would retry for days. Failures are logged and, where they concern
     * money, recorded as payment exceptions for staff.
     */
    @PostMapping("/api/webhooks/stripe")
    public ResponseEntity<String> handle(
            @RequestBody String payload,
            @RequestHeader(value = "Stripe-Signature", required = false) String signature) {

        if (signature == null || signature.isBlank()) {
            log.warn("Rejected webhook with no Stripe-Signature header");
            return ResponseEntity.badRequest().body("Missing signature");
        }

        Event event;
        try {
            event = Webhook.constructEvent(payload, signature, properties.webhookSecret());
        } catch (SignatureVerificationException ex) {
            // Either a misconfigured secret or a forgery attempt. Never process it, and never
            // say which — the response goes to whoever sent it.
            log.warn("Rejected webhook with an invalid signature: {}", ex.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("Invalid signature");
        }

        try {
            processor.process(event, payload);
        } catch (RuntimeException ex) {
            // Logged with the event id so it can be replayed from the Stripe dashboard.
            log.error("Failed to process Stripe event {} ({})", event.getId(), event.getType(), ex);
        }
        return ResponseEntity.ok("");
    }
}

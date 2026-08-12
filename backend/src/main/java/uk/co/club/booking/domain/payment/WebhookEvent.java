package uk.co.club.booking.domain.payment;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * A Stripe event we have seen.
 *
 * <p>Exists solely as an idempotency guard. Stripe delivers events at least once and sometimes
 * out of order, so the same "payment succeeded" can arrive twice. Inserting the event id — the
 * primary key — inside the same transaction that processes the event makes a replay a no-op:
 * the second insert violates the key and rolls the duplicate work back with it.
 */
@Entity
@Table(name = "webhook_event_log")
public class WebhookEvent {

    @Id
    @Column(name = "event_id")
    private String eventId;

    @Column(name = "event_type", nullable = false)
    private String eventType;

    @Column(name = "received_at", nullable = false, insertable = false, updatable = false)
    private Instant receivedAt;

    @Column(name = "processed_at")
    private Instant processedAt;

    /**
     * The raw payload, for diagnosing a disputed payment months later.
     *
     * <p>Stripe payloads contain no card numbers — only tokens and the last four digits — so
     * this is safe to retain.
     */
    @Column(nullable = false, columnDefinition = "jsonb")
    private String payload;

    protected WebhookEvent() {
        // for JPA
    }

    public WebhookEvent(String eventId, String eventType, String payload) {
        this.eventId = eventId;
        this.eventType = eventType;
        this.payload = payload;
    }

    public String getEventId() {
        return eventId;
    }

    public String getEventType() {
        return eventType;
    }

    public Instant getReceivedAt() {
        return receivedAt;
    }

    public Instant getProcessedAt() {
        return processedAt;
    }

    public void markProcessed(Instant at) {
        this.processedAt = at;
    }

    public String getPayload() {
        return payload;
    }
}

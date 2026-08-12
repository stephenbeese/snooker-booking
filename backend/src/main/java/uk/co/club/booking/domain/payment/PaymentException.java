package uk.co.club.booking.domain.payment;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * A "money taken but the slot was gone" anomaly, queued for staff to resolve.
 *
 * <p>Not an exception in the Java sense — a durable record. These cases cannot be resolved
 * automatically: whether the right answer is a refund, a different table or a different time is
 * a conversation with the customer, not a rule. Automating it would guess wrong.
 */
@Entity
@Table(name = "payment_exception")
public class PaymentException {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "booking_id", nullable = false)
    private Long bookingId;

    @Column(name = "payment_id", nullable = false)
    private Long paymentId;

    @Column(nullable = false)
    private String reason;

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    @Column(name = "resolved_by_user_id")
    private Long resolvedByUserId;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private Instant createdAt;

    protected PaymentException() {
        // for JPA
    }

    public PaymentException(long bookingId, long paymentId, String reason) {
        this.bookingId = bookingId;
        this.paymentId = paymentId;
        this.reason = reason;
    }

    public Long getId() {
        return id;
    }

    public Long getBookingId() {
        return bookingId;
    }

    public Long getPaymentId() {
        return paymentId;
    }

    public String getReason() {
        return reason;
    }

    public Instant getResolvedAt() {
        return resolvedAt;
    }

    public void resolve(Instant at, Long byUserId) {
        this.resolvedAt = at;
        this.resolvedByUserId = byUserId;
    }

    public Long getResolvedByUserId() {
        return resolvedByUserId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}

package uk.co.club.booking.domain.booking;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import uk.co.club.booking.domain.table.SnookerTable;

/**
 * A reservation of one table for one interval.
 *
 * <p>Times are {@link Instant} (mapped to {@code timestamptz}), never
 * {@code LocalDateTime} — a booking occupies a physical interval, and local wall-clock
 * types are the source of every "an hour out in October" bug.
 *
 * <p>Non-overlap is guaranteed by the {@code booking_no_overlap} database constraint,
 * not by this class.
 */
@Entity
@Table(name = "booking")
public class Booking {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Opaque human-facing identifier, e.g. SNK-7F3K2A. */
    @Column(nullable = false, unique = true)
    private String reference;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "snooker_table_id", nullable = false)
    private SnookerTable snookerTable;

    @Column(name = "start_at", nullable = false)
    private Instant startAt;

    @Column(name = "end_at", nullable = false)
    private Instant endAt;

    @Column(name = "duration_minutes", nullable = false)
    private int durationMinutes;

    /** Captured at creation. A later rate change must not reprice an existing booking. */
    @Column(name = "price_pence", nullable = false)
    private int pricePence;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private BookingStatus status;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private BookingSource source;

    /** Null for a telephone booking taken for someone without an account. */
    @Column(name = "user_id")
    private Long userId;

    @Column(name = "customer_name", nullable = false)
    private String customerName;

    @Column(name = "customer_email")
    private String customerEmail;

    @Column(name = "customer_phone")
    private String customerPhone;

    /** Set only while PENDING_PAYMENT; enforced by a database CHECK. */
    @Column(name = "hold_expires_at")
    private Instant holdExpiresAt;

    private String notes;

    @Column(name = "created_by_user_id")
    private Long createdByUserId;

    @Column(name = "cancelled_at")
    private Instant cancelledAt;

    @Column(name = "cancelled_by_user_id")
    private Long cancelledByUserId;

    /** When this booking was last moved, and by whom. Null until it is. */
    @Column(name = "amended_at")
    private Instant amendedAt;

    @Column(name = "amended_by_user_id")
    private Long amendedByUserId;

    @Column(name = "cancellation_reason")
    private String cancellationReason;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false, updatable = false)
    private Instant updatedAt;

    @Version
    private Long version;

    protected Booking() {
        // for JPA
    }

    public Long getId() {
        return id;
    }

    public String getReference() {
        return reference;
    }

    public void setReference(String reference) {
        this.reference = reference;
    }

    public SnookerTable getSnookerTable() {
        return snookerTable;
    }

    public void setSnookerTable(SnookerTable snookerTable) {
        this.snookerTable = snookerTable;
    }

    public Instant getStartAt() {
        return startAt;
    }

    public void setStartAt(Instant startAt) {
        this.startAt = startAt;
    }

    public Instant getEndAt() {
        return endAt;
    }

    public void setEndAt(Instant endAt) {
        this.endAt = endAt;
    }

    public int getDurationMinutes() {
        return durationMinutes;
    }

    public void setDurationMinutes(int durationMinutes) {
        this.durationMinutes = durationMinutes;
    }

    public int getPricePence() {
        return pricePence;
    }

    public void setPricePence(int pricePence) {
        this.pricePence = pricePence;
    }

    public BookingStatus getStatus() {
        return status;
    }

    public void setStatus(BookingStatus status) {
        this.status = status;
    }

    public BookingSource getSource() {
        return source;
    }

    public void setSource(BookingSource source) {
        this.source = source;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public String getCustomerName() {
        return customerName;
    }

    public void setCustomerName(String customerName) {
        this.customerName = customerName;
    }

    public String getCustomerEmail() {
        return customerEmail;
    }

    public void setCustomerEmail(String customerEmail) {
        this.customerEmail = customerEmail;
    }

    public String getCustomerPhone() {
        return customerPhone;
    }

    public void setCustomerPhone(String customerPhone) {
        this.customerPhone = customerPhone;
    }

    public Instant getHoldExpiresAt() {
        return holdExpiresAt;
    }

    public void setHoldExpiresAt(Instant holdExpiresAt) {
        this.holdExpiresAt = holdExpiresAt;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }

    public Long getCreatedByUserId() {
        return createdByUserId;
    }

    public void setCreatedByUserId(Long createdByUserId) {
        this.createdByUserId = createdByUserId;
    }

    public Instant getCancelledAt() {
        return cancelledAt;
    }

    public void setCancelledAt(Instant cancelledAt) {
        this.cancelledAt = cancelledAt;
    }

    public Instant getAmendedAt() {
        return amendedAt;
    }

    public void setAmendedAt(Instant amendedAt) {
        this.amendedAt = amendedAt;
    }

    public Long getAmendedByUserId() {
        return amendedByUserId;
    }

    public void setAmendedByUserId(Long amendedByUserId) {
        this.amendedByUserId = amendedByUserId;
    }

    public Long getCancelledByUserId() {
        return cancelledByUserId;
    }

    public void setCancelledByUserId(Long cancelledByUserId) {
        this.cancelledByUserId = cancelledByUserId;
    }

    public String getCancellationReason() {
        return cancellationReason;
    }

    public void setCancellationReason(String cancellationReason) {
        this.cancellationReason = cancellationReason;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public Long getVersion() {
        return version;
    }

    /**
     * A hold whose expiry has passed. Such a booking still blocks its slot at the
     * database level (the constraint predicate cannot reference now()), so the read and
     * write paths treat it as already released.
     */
    public boolean isLapsedHold(Instant now) {
        return status == BookingStatus.PENDING_PAYMENT
                && holdExpiresAt != null
                && holdExpiresAt.isBefore(now);
    }
}

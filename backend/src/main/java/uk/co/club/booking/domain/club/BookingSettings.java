package uk.co.club.booking.domain.club;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Duration;
import java.time.Instant;

/**
 * Booking rules, configurable by an admin. These actively control the booking engine —
 * they are not informational. Database CHECK constraints keep the combination coherent
 * (max >= min, durations divisible by the increment, sane hold TTL).
 *
 * <p>Singleton row (id = 1), enforced by a CHECK.
 */
@Entity
@Table(name = "booking_settings")
public class BookingSettings {

    public static final short SINGLETON_ID = 1;

    /**
     * Unwraps the singleton lookup, failing loudly if the row is missing.
     *
     * <p>A static helper rather than a {@code default} method on the repository: default methods
     * on a Mockito mock silently return null instead of running, which turns a mocking mistake
     * into what looks like a production NullPointerException.
     */
    public static BookingSettings require(java.util.Optional<BookingSettings> settings) {
        return settings.orElseThrow(() -> new IllegalStateException(
                "booking_settings row is missing; migration V6 should have inserted it"));
    }

    @Id
    private Short id = SINGLETON_ID;

    @Column(name = "min_duration_minutes", nullable = false)
    private int minDurationMinutes;

    @Column(name = "max_duration_minutes", nullable = false)
    private int maxDurationMinutes;

    @Column(name = "increment_minutes", nullable = false)
    private int incrementMinutes;

    @Column(name = "min_notice_minutes", nullable = false)
    private int minNoticeMinutes;

    @Column(name = "max_advance_days", nullable = false)
    private int maxAdvanceDays;

    @Column(name = "cancellation_notice_hours", nullable = false)
    private int cancellationNoticeHours;

    @Column(name = "payment_hold_minutes", nullable = false)
    private int paymentHoldMinutes;

    @Column(name = "updated_at", nullable = false, insertable = false, updatable = false)
    private Instant updatedAt;

    protected BookingSettings() {
        // for JPA
    }

    public Short getId() {
        return id;
    }

    public int getMinDurationMinutes() {
        return minDurationMinutes;
    }

    public void setMinDurationMinutes(int minDurationMinutes) {
        this.minDurationMinutes = minDurationMinutes;
    }

    public int getMaxDurationMinutes() {
        return maxDurationMinutes;
    }

    public void setMaxDurationMinutes(int maxDurationMinutes) {
        this.maxDurationMinutes = maxDurationMinutes;
    }

    public int getIncrementMinutes() {
        return incrementMinutes;
    }

    public void setIncrementMinutes(int incrementMinutes) {
        this.incrementMinutes = incrementMinutes;
    }

    public int getMinNoticeMinutes() {
        return minNoticeMinutes;
    }

    public void setMinNoticeMinutes(int minNoticeMinutes) {
        this.minNoticeMinutes = minNoticeMinutes;
    }

    public int getMaxAdvanceDays() {
        return maxAdvanceDays;
    }

    public void setMaxAdvanceDays(int maxAdvanceDays) {
        this.maxAdvanceDays = maxAdvanceDays;
    }

    public int getCancellationNoticeHours() {
        return cancellationNoticeHours;
    }

    public void setCancellationNoticeHours(int cancellationNoticeHours) {
        this.cancellationNoticeHours = cancellationNoticeHours;
    }

    public int getPaymentHoldMinutes() {
        return paymentHoldMinutes;
    }

    public void setPaymentHoldMinutes(int paymentHoldMinutes) {
        this.paymentHoldMinutes = paymentHoldMinutes;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public Duration minNotice() {
        return Duration.ofMinutes(minNoticeMinutes);
    }

    public Duration increment() {
        return Duration.ofMinutes(incrementMinutes);
    }

    public Duration cancellationNotice() {
        return Duration.ofHours(cancellationNoticeHours);
    }

    public Duration paymentHold() {
        return Duration.ofMinutes(paymentHoldMinutes);
    }

    /** Whether a requested duration is permitted by the configured rules. */
    public boolean isDurationAllowed(int minutes) {
        return minutes >= minDurationMinutes
                && minutes <= maxDurationMinutes
                && minutes % incrementMinutes == 0;
    }
}

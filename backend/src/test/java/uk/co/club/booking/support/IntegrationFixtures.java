package uk.co.club.booking.support;

import java.time.Instant;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Builds preconditions for integration tests.
 *
 * <p>Deliberately JDBC rather than the repositories: a fixture that goes through the service
 * layer inherits its validation, so you cannot set up the very states the tests need to probe
 * (a lapsed hold, a cancelled booking, an inactive table).
 *
 * <p>{@code REQUIRES_NEW} everywhere so fixture rows are committed and therefore visible to the
 * other threads in the concurrency tests. Rows written in an uncommitted transaction would be
 * invisible to every racing thread and the tests would fail for a reason unrelated to the code.
 */
@Component
public class IntegrationFixtures {

    private final JdbcTemplate jdbc;
    private final PasswordEncoder passwordEncoder;

    public IntegrationFixtures(JdbcTemplate jdbc, PasswordEncoder passwordEncoder) {
        this.jdbc = jdbc;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public long aTable(String name) {
        return aTable(name, "SNOOKER", true);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public long anInactiveTable(String name) {
        return aTable(name, "SNOOKER", false);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public long aTable(String name, String type, boolean active) {
        Long id = jdbc.queryForObject(
                """
                INSERT INTO snooker_table (name, table_type, display_order, active)
                VALUES (?, ?, (SELECT COALESCE(MAX(display_order), 0) + 1 FROM snooker_table), ?)
                RETURNING id
                """,
                Long.class,
                name,
                type,
                active);
        return id;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public long aCustomer(String email, String rawPassword) {
        return aUser(email, rawPassword, "CUSTOMER");
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public long anAdmin(String email, String rawPassword) {
        return aUser(email, rawPassword, "ADMIN");
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public long aUser(String email, String rawPassword, String role) {
        Long id = jdbc.queryForObject(
                """
                INSERT INTO app_user (email, password_hash, first_name, last_name, role)
                VALUES (?, ?, 'Test', 'User', ?)
                RETURNING id
                """,
                Long.class,
                email,
                passwordEncoder.encode(rawPassword),
                role);
        return id;
    }

    /** A maintenance block, to test that it blocks booking. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public long aMaintenanceBlock(long tableId, Instant startAt, Instant endAt, String reason) {
        Long id = jdbc.queryForObject(
                """
                INSERT INTO maintenance_block (snooker_table_id, start_at, end_at, reason)
                VALUES (?, ?, ?, ?)
                RETURNING id
                """,
                Long.class,
                tableId,
                java.sql.Timestamp.from(startAt),
                java.sql.Timestamp.from(endAt),
                reason);
        return id;
    }

    /**
     * A booking in an arbitrary state, including states the service would refuse to create —
     * which is exactly why this bypasses it.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public long aBooking(
            String reference,
            long tableId,
            Instant startAt,
            int durationMinutes,
            String status,
            Long userId,
            Instant holdExpiresAt) {
        Long id = jdbc.queryForObject(
                """
                INSERT INTO booking (reference, snooker_table_id, start_at, end_at,
                                     duration_minutes, price_pence, status, source,
                                     user_id, customer_name, hold_expires_at)
                VALUES (?, ?, ?, ?, ?, 1200, ?, 'ONLINE', ?, 'Fixture Customer', ?)
                RETURNING id
                """,
                Long.class,
                reference,
                tableId,
                java.sql.Timestamp.from(startAt),
                java.sql.Timestamp.from(startAt.plusSeconds(durationMinutes * 60L)),
                durationMinutes,
                status,
                userId,
                holdExpiresAt == null ? null : java.sql.Timestamp.from(holdExpiresAt));
        return id;
    }

    /** Overrides the singleton booking settings for a test that depends on a specific rule. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void bookingSettings(
            int minDuration, int maxDuration, int increment, int minNoticeMinutes, int maxAdvanceDays) {
        jdbc.update(
                """
                UPDATE booking_settings
                   SET min_duration_minutes = ?, max_duration_minutes = ?, increment_minutes = ?,
                       min_notice_minutes = ?, max_advance_days = ?
                 WHERE id = 1
                """,
                minDuration,
                maxDuration,
                increment,
                minNoticeMinutes,
                maxAdvanceDays);
    }

    /** Sets the cancellation notice period, for tests either side of the deadline. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void cancellationNoticeHours(int hours) {
        jdbc.update("UPDATE booking_settings SET cancellation_notice_hours = ? WHERE id = 1", hours);
    }

    /** Closes the club on a weekday, to test the opening-hours rule. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void closeClubOn(java.time.DayOfWeek day) {
        jdbc.update(
                "UPDATE opening_hours SET closed = TRUE, open_time = NULL, close_time = NULL "
                        + "WHERE day_of_week = ?",
                day.getValue());
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public String statusOf(long bookingId) {
        return jdbc.queryForObject("SELECT status FROM booking WHERE id = ?", String.class, bookingId);
    }
}

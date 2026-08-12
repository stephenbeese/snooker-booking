package uk.co.club.booking.support;

import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Base for tests that need a real PostgreSQL.
 *
 * <p><strong>H2 is not an option here.</strong> The system's core invariant is an
 * {@code EXCLUDE USING gist} constraint, which H2 cannot express at all — an H2-backed suite
 * would run green while providing exactly zero coverage of the one thing that prevents double
 * booking. Every integration test therefore runs against the same Postgres version as
 * production.
 *
 * <p>The container is {@code static}, so one Postgres serves the whole JVM rather than being
 * started per class. Testcontainers' JVM shutdown hook stops it; there is deliberately no
 * {@code @AfterAll} teardown, which would tear the container down for every subsequent class.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Testcontainers
public abstract class AbstractIntegrationTest {

    @ServiceConnection
    @SuppressWarnings("resource") // Testcontainers closes it via its shutdown hook.
    static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:17-alpine")
                    .withDatabaseName("snooker_test")
                    .withUsername("snooker")
                    .withPassword("snooker")
                    // btree_gist needs elevated rights; the container superuser has them.
                    .withReuse(false);

    static {
        POSTGRES.start();
    }

    @Autowired protected JdbcTemplate jdbcTemplate;

    /**
     * Truncates between tests rather than relying on {@code @Transactional} rollback.
     *
     * <p>Rollback would be faster but would hide the very behaviour under test: a constraint
     * violation on a deferred INSERT, and the visibility rules between concurrent
     * transactions. A test that never commits cannot observe either.
     */
    @BeforeEach
    void resetDatabase() {
        jdbcTemplate.execute(
                """
                TRUNCATE TABLE payment_exception, payment, booking, maintenance_block,
                               password_reset_token, snooker_table, app_user
                RESTART IDENTITY CASCADE
                """);

        // Settings and opening hours are singleton/reference rows that migrations insert, so
        // they are reset to their migrated values rather than truncated. Without this a test
        // that closes the club on a Tuesday, or shortens the notice period, silently changes
        // the preconditions of every test that runs after it — the classic order-dependent
        // suite that passes alone and fails in CI.
        jdbcTemplate.execute(
                """
                UPDATE booking_settings
                   SET min_duration_minutes = 30, max_duration_minutes = 240,
                       increment_minutes = 30, min_notice_minutes = 60,
                       max_advance_days = 30, cancellation_notice_hours = 24,
                       payment_hold_minutes = 15
                 WHERE id = 1
                """);
        // Mirrors V5 exactly, including Sunday's shorter 12:00-20:00 day — a blanket
        // 10:00-23:00 reset here would quietly give tests a Sunday the real club does not have.
        jdbcTemplate.execute(
                """
                UPDATE opening_hours
                   SET closed = FALSE,
                       open_time  = CASE WHEN day_of_week = 7 THEN TIME '12:00' ELSE TIME '10:00' END,
                       close_time = CASE WHEN day_of_week = 7 THEN TIME '20:00' ELSE TIME '23:00' END
                """);
        // Restored to V6's single catch-all rule. A test that adds a peak or off-peak rule
        // would otherwise change the price of every booking created after it — and because
        // the extra rule usually has a higher priority, the failures land in unrelated
        // classes as an unexplained few pence.
        jdbcTemplate.execute("DELETE FROM pricing_rule WHERE name <> 'Standard hourly rate'");
        jdbcTemplate.execute(
                """
                UPDATE pricing_rule
                   SET hourly_rate_pence = 1200, priority = 0, active = TRUE,
                       table_type = NULL, day_of_week = NULL,
                       start_time = NULL, end_time = NULL
                 WHERE name = 'Standard hourly rate'
                """);
    }
}

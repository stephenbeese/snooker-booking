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
                    .withReuse(false)
                    // Above Postgres's default 100. Each test class that overrides a property
                    // gets its own cached Spring context and its own connection pool, and
                    // those pools are never closed, so the total climbs as classes are added.
                    // Running out surfaces as every test in one arbitrary class failing to
                    // start — a failure that looks like a wiring bug and is really exhaustion.
                    .withCommand("postgres", "-c", "max_connections=200");

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
                               password_reset_token, snooker_table, app_user,
                               opening_hours_override, cafe_item
                RESTART IDENTITY CASCADE
                """);

        // Mirrors V4. Omitted originally, and the gap stayed invisible until enough test
        // classes existed to change the running order: AuthorizationBoundaryIT renames the
        // club to "Boundary Club" and never puts it back, so ClubControllerIT failed only
        // when it happened to run afterwards. Exactly the order-dependent suite the resets
        // below exist to prevent.
        jdbcTemplate.execute(
                """
                UPDATE club_settings
                   SET name = 'The Snooker Club',
                       address_line1 = '1 High Street', address_line2 = NULL,
                       city = 'Manchester', postcode = 'M1 1AA',
                       phone = '0161 000 0000', email = 'bookings@snookerclub.example',
                       website = NULL,
                       description = 'Championship tables, open seven days a week.'
                 WHERE id = 1
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
        // By id, not by name. Deleting "everything not called 'Standard hourly rate'" leaves
        // behind any rule another test created under that same name — and AuthorizationBoundaryIT
        // creates exactly one, by POSTing a catch-all rule to prove an admin may. Two catch-alls
        // then survive into the next class, where "the last catch-all cannot be deleted"
        // correctly permits deleting one and the test fails. The migration's row is the lowest
        // id; keeping precisely that one is unambiguous.
        jdbcTemplate.execute(
                "DELETE FROM pricing_rule WHERE id <> (SELECT MIN(id) FROM pricing_rule)");
        jdbcTemplate.execute(
                """
                UPDATE pricing_rule
                   SET name = 'Standard hourly rate',
                       hourly_rate_pence = 1200, priority = 0, active = TRUE,
                       table_type = NULL,
                       start_time = NULL, end_time = NULL
                 WHERE id = (SELECT MIN(id) FROM pricing_rule)
                """);
        // Days moved to their own table in V12. The DELETE above removes the child rows of
        // every other rule by cascade, but the surviving seeded rule keeps whatever days a
        // test gave it — leaving it applying on Mondays only for every class that follows.
        jdbcTemplate.execute("DELETE FROM pricing_rule_day");

        // Table types became data in V15, so they are reference rows like opening_hours rather
        // than something to truncate — the three seeded codes must survive, because every
        // table fixture references one. Deleting the extras and restoring the seeded three
        // stops a test that adds "Chinese pool", renames Snooker, or deactivates a type from
        // changing what every later class can assign. Ordered after the snooker_table
        // TRUNCATE above, which is what releases the foreign key.
        jdbcTemplate.execute(
                "DELETE FROM table_type WHERE code NOT IN ('SNOOKER','ENGLISH_POOL','AMERICAN_POOL')");
        jdbcTemplate.execute(
                """
                UPDATE table_type
                   SET label = CASE code
                                   WHEN 'SNOOKER'       THEN 'Snooker'
                                   WHEN 'ENGLISH_POOL'  THEN 'English pool'
                                   ELSE 'American pool'
                               END,
                       display_order = CASE code
                                           WHEN 'SNOOKER'      THEN 0
                                           WHEN 'ENGLISH_POOL' THEN 1
                                           ELSE 2
                                       END,
                       active = TRUE
                """);

        // Cafe categories are reference rows seeded by V17, exactly like table types above, so
        // they are restored rather than truncated. The cafe_item TRUNCATE has already released
        // the foreign key. Without this a test that adds "Cocktails", renames a section or
        // withdraws one leaves that state for every class that follows.
        jdbcTemplate.execute(
                """
                DELETE FROM cafe_category
                 WHERE code NOT IN ('HOT_DRINKS','COLD_DRINKS','BEER_AND_CIDER',
                                    'WINE_AND_SPIRITS','SNACKS','FOOD')
                """);
        jdbcTemplate.execute(
                """
                UPDATE cafe_category
                   SET label = CASE code
                                   WHEN 'HOT_DRINKS'       THEN 'Hot drinks'
                                   WHEN 'COLD_DRINKS'      THEN 'Cold drinks'
                                   WHEN 'BEER_AND_CIDER'   THEN 'Beer & cider'
                                   WHEN 'WINE_AND_SPIRITS' THEN 'Wine & spirits'
                                   WHEN 'SNACKS'           THEN 'Snacks'
                                   ELSE 'Food'
                               END,
                       display_order = CASE code
                                           WHEN 'HOT_DRINKS'       THEN 0
                                           WHEN 'COLD_DRINKS'      THEN 1
                                           WHEN 'BEER_AND_CIDER'   THEN 2
                                           WHEN 'WINE_AND_SPIRITS' THEN 3
                                           WHEN 'SNACKS'           THEN 4
                                           ELSE 5
                                       END,
                       active = TRUE
                """);
    }
}

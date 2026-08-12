package uk.co.club.booking.domain.booking;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import uk.co.club.booking.common.error.SlotTakenException;
import uk.co.club.booking.common.time.ClubClock;
import uk.co.club.booking.support.AbstractIntegrationTest;
import uk.co.club.booking.support.IntegrationFixtures;

/**
 * Proves the system cannot double-book a table, which is the single most important property
 * it has.
 *
 * <p>This test exists because the obvious implementation — check availability, then insert — is
 * a race that passes every sequential test and fails in production the first time two people
 * click at once. Testing it therefore requires genuine concurrency against a real PostgreSQL:
 * the guarantee lives in an {@code EXCLUDE USING gist} constraint that no in-memory database
 * can even express.
 */
class BookingConcurrencyIT extends AbstractIntegrationTest {

    @Autowired private BookingService bookingService;
    @Autowired private BookingRepository bookingRepository;
    @Autowired private IntegrationFixtures fixtures;
    @Autowired private ClubClock clubClock;
    @Autowired private JdbcTemplate jdbc;

    private static final int THREADS = 8;

    @Test
    @DisplayName("eight threads racing for the same slot produce exactly one booking")
    void concurrentIdenticalBookingsLeaveExactlyOne() throws Exception {
        long tableId = fixtures.aTable("Table 1");
        Instant start = tomorrowAt(LocalTime.of(19, 0));

        Outcome outcome = raceFor(tableId, start, THREADS);

        // The whole point: one winner, everyone else told the slot went.
        assertThat(outcome.succeeded()).isEqualTo(1);
        assertThat(outcome.slotTaken()).isEqualTo(THREADS - 1);
        assertThat(outcome.unexpected()).isEmpty();
        assertThat(bookingRepository.count()).isEqualTo(1);
    }

    @Test
    @DisplayName("overlapping — not identical — concurrent bookings also leave exactly one")
    void concurrentOverlappingBookingsLeaveExactlyOne() throws Exception {
        long tableId = fixtures.aTable("Table 1");
        Instant base = tomorrowAt(LocalTime.of(19, 0));

        // Staggered by 30 minutes each, all 120 minutes long, so every pair overlaps but no
        // two requests are identical. A naive unique index on (table, start_at) would let all
        // four of these through — only a range-overlap constraint catches them.
        List<Callable<Result>> attempts = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            Instant start = base.plus(Duration.ofMinutes(30L * i));
            attempts.add(() -> attempt(tableId, start, 120));
        }

        Outcome outcome = runConcurrently(attempts);

        assertThat(outcome.succeeded()).isEqualTo(1);
        assertThat(outcome.unexpected()).isEmpty();
        assertThat(bookingRepository.count()).isEqualTo(1);
    }

    /**
     * The constraint alone is sufficient — the application's pre-check is only cosmetic.
     *
     * <p>Inserts directly through JDBC, bypassing {@link BookingValidator} entirely, so nothing
     * but the database is protecting the slot. If this passes, the guarantee genuinely does not
     * depend on application code remembering to look first.
     */
    @Test
    @DisplayName("the database constraint holds with the application pre-check bypassed")
    void constraintAloneRejectsOverlapWithoutAnyApplicationCheck() throws Exception {
        long tableId = fixtures.aTable("Table 1");
        Instant start = tomorrowAt(LocalTime.of(19, 0));
        Instant end = start.plus(Duration.ofHours(1));

        List<Callable<Result>> attempts = new ArrayList<>();
        for (int i = 0; i < THREADS; i++) {
            int index = i;
            attempts.add(() -> {
                try {
                    jdbc.update(
                            """
                            INSERT INTO booking (reference, snooker_table_id, start_at, end_at,
                                                 duration_minutes, price_pence, status, source,
                                                 customer_name)
                            VALUES (?, ?, ?, ?, 60, 1200, 'CONFIRMED', 'ONLINE', 'Raw Insert')
                            """,
                            "SNK-RAW%03d".formatted(index),
                            tableId,
                            java.sql.Timestamp.from(start),
                            java.sql.Timestamp.from(end));
                    return Result.SUCCESS;
                } catch (org.springframework.dao.DataIntegrityViolationException ex) {
                    // The constraint name proves it was the overlap rule, not some other
                    // failure that happens to look like success-prevention.
                    assertThat(ex.getMessage()).contains("booking_no_overlap");
                    return Result.SLOT_TAKEN;
                } catch (org.springframework.dao.PessimisticLockingFailureException ex) {
                    // Also a rejection. Concurrent inserts checking the gist index can
                    // deadlock, and PostgreSQL aborts one of them rather than letting both
                    // proceed — so the slot is still protected, just by a different mechanism
                    // than the constraint error.
                    //
                    // Caught at the PessimisticLockingFailureException supertype, not at
                    // CannotAcquireLockException: Spring maps the identical PostgreSQL deadlock
                    // (SQLState 40P01) to different subclasses depending on whether it surfaced
                    // through JdbcTemplate or JPA. Matching the supertype covers both instead of
                    // playing whack-a-mole with subclasses.
                    assertThat(ex.getMessage()).contains("deadlock detected");
                    return Result.SLOT_TAKEN;
                }
            });
        }

        Outcome outcome = runConcurrently(attempts);

        // Asserted first, and before the counts: it carries the actual exception messages, so
        // when something unforeseen happens the failure says what, instead of reporting an
        // unexplained "expected 7 but was 0".
        assertThat(outcome.unexpected()).isEmpty();
        assertThat(outcome.succeeded()).isEqualTo(1);
        assertThat(outcome.slotTaken()).isEqualTo(THREADS - 1);
        assertThat(bookingRepository.count()).isEqualTo(1);
    }

    @Test
    @DisplayName("abutting bookings are both accepted — touching is not overlapping")
    void abuttingBookingsBothSucceed() throws Exception {
        long tableId = fixtures.aTable("Table 1");
        Instant first = tomorrowAt(LocalTime.of(19, 0));

        // 19:00-20:00 and 20:00-21:00. Half-open '[)' bounds mean these do not conflict; if
        // the constraint used inclusive bounds, the club would lose a slot between every
        // consecutive pair of bookings.
        bookingService.create(command(tableId, first, 60), BookingPolicy.online());
        bookingService.create(
                command(tableId, first.plus(Duration.ofHours(1)), 60), BookingPolicy.online());

        assertThat(bookingRepository.count()).isEqualTo(2);
    }

    @Test
    @DisplayName("the same slot on a different table is accepted")
    void sameTimeDifferentTableSucceeds() throws Exception {
        long tableOne = fixtures.aTable("Table 1");
        long tableTwo = fixtures.aTable("Table 2");
        Instant start = tomorrowAt(LocalTime.of(19, 0));

        bookingService.create(command(tableOne, start, 60), BookingPolicy.online());
        bookingService.create(command(tableTwo, start, 60), BookingPolicy.online());

        assertThat(bookingRepository.count()).isEqualTo(2);
    }

    @Test
    @DisplayName("cancelling releases the slot for immediate rebooking")
    void cancellingFreesTheSlot() throws Exception {
        long tableId = fixtures.aTable("Table 1");
        Instant start = tomorrowAt(LocalTime.of(19, 0));

        Booking first = bookingService.create(command(tableId, start, 60), BookingPolicy.online());

        // Straight to the database: this test is about the constraint's partial predicate,
        // not about the cancellation service (which arrives in Phase 3).
        jdbc.update("UPDATE booking SET status = 'CANCELLED', hold_expires_at = NULL WHERE id = ?",
                first.getId());

        // The constraint predicate covers only slot-occupying statuses, so a cancelled row
        // stops blocking without needing to be deleted — which matters because a deleted
        // booking could not be audited or reinstated.
        Booking second = bookingService.create(command(tableId, start, 60), BookingPolicy.online());

        assertThat(second.getId()).isNotEqualTo(first.getId());
        assertThat(bookingRepository.count()).isEqualTo(2);
    }

    /**
     * Repeated because concurrency bugs are probabilistic: a single green run of a racing test
     * proves very little. Ten runs of eight threads is enough to catch an ordering that only
     * shows up sometimes, without making the suite slow.
     */
    @RepeatedTest(10)
    @DisplayName("the invariant holds under repeated racing")
    void repeatedRacesNeverDoubleBook() throws Exception {
        long tableId = fixtures.aTable("Table 1");
        Instant start = tomorrowAt(LocalTime.of(19, 0));

        Outcome outcome = raceFor(tableId, start, THREADS);

        assertThat(outcome.succeeded()).isEqualTo(1);
        assertThat(outcome.unexpected()).isEmpty();
        assertThat(bookingRepository.count()).isEqualTo(1);
    }

    // ------------------------------------------------------------------ helpers

    private Outcome raceFor(long tableId, Instant start, int threads) throws Exception {
        List<Callable<Result>> attempts = new ArrayList<>();
        for (int i = 0; i < threads; i++) {
            attempts.add(() -> attempt(tableId, start, 60));
        }
        return runConcurrently(attempts);
    }

    /**
     * Runs every attempt at once and collects the outcomes.
     *
     * <p>{@code invokeAll} rather than a loop of {@code submit}: it hands every task to the pool
     * before any of them can finish, which is what makes the requests genuinely contend. A
     * submit-then-get loop would serialise them and the test would pass for the wrong reason.
     */
    private Outcome runConcurrently(List<Callable<Result>> attempts) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(attempts.size());
        try {
            List<Future<Result>> futures = pool.invokeAll(attempts, 60, TimeUnit.SECONDS);

            AtomicInteger succeeded = new AtomicInteger();
            AtomicInteger slotTaken = new AtomicInteger();
            List<String> unexpected = new ArrayList<>();

            for (Future<Result> future : futures) {
                try {
                    switch (future.get()) {
                        case SUCCESS -> succeeded.incrementAndGet();
                        case SLOT_TAKEN -> slotTaken.incrementAndGet();
                    }
                } catch (Exception ex) {
                    // Anything other than "slot taken" is a real failure and must not be
                    // quietly counted as a rejection.
                    Throwable cause = ex.getCause() == null ? ex : ex.getCause();
                    unexpected.add(cause.getClass().getSimpleName() + ": " + cause.getMessage());
                }
            }
            return new Outcome(succeeded.get(), slotTaken.get(), unexpected);
        } finally {
            pool.shutdownNow();
        }
    }

    private Result attempt(long tableId, Instant start, int minutes) {
        try {
            bookingService.create(command(tableId, start, minutes), BookingPolicy.online());
            return Result.SUCCESS;
        } catch (SlotTakenException ex) {
            return Result.SLOT_TAKEN;
        } catch (uk.co.club.booking.common.error.BusinessRuleException ex) {
            // The advisory pre-check in the validator also reports a lost race, as a 422.
            // Both are legitimate "you did not get the slot" outcomes.
            if (ex.getCode() == uk.co.club.booking.common.error.ErrorCode.SLOT_UNAVAILABLE) {
                return Result.SLOT_TAKEN;
            }
            throw ex;
        }
    }

    private CreateBookingCommand command(long tableId, Instant start, int minutes) {
        return new CreateBookingCommand(
                tableId,
                start,
                minutes,
                null,
                "Race Tester",
                "race@example.test",
                null,
                null,
                BookingSource.ONLINE,
                null);
    }

    /**
     * A near-future date that is never a Sunday, at the given club-local time.
     *
     * <p>Sunday closes at 20:00 (V5), so a plain "tomorrow at 19:00 for two hours" would fail
     * the opening-hours rule one day in seven — a test that goes red on Saturdays and confuses
     * whoever is on duty. Skipping Sunday keeps the fixture inside opening hours every day of
     * the week without weakening what is being tested.
     */
    private Instant tomorrowAt(LocalTime time) {
        LocalDate date = clubClock.today().plusDays(1);
        if (date.getDayOfWeek() == java.time.DayOfWeek.SUNDAY) {
            date = date.plusDays(1);
        }
        return clubClock.toInstant(date, time);
    }

    private enum Result {
        SUCCESS,
        SLOT_TAKEN
    }

    private record Outcome(int succeeded, int slotTaken, List<String> unexpected) {}
}

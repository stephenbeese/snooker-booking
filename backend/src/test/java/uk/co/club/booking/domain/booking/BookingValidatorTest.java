package uk.co.club.booking.domain.booking;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyShort;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import uk.co.club.booking.common.error.BusinessRuleException;
import uk.co.club.booking.common.error.ErrorCode;
import uk.co.club.booking.common.error.NotFoundException;
import uk.co.club.booking.common.time.ClubClock;
import uk.co.club.booking.domain.availability.SlotGenerator;
import uk.co.club.booking.domain.club.BookingSettingsRepository;
import uk.co.club.booking.domain.club.OpeningHoursRepository;
import uk.co.club.booking.domain.table.MaintenanceBlockRepository;
import uk.co.club.booking.domain.table.SnookerTable;
import uk.co.club.booking.domain.table.SnookerTableRepository;
import uk.co.club.booking.support.TestFixtures;

/**
 * The nine booking rules, tested against a fixed clock.
 *
 * <p>Fast unit tests, deliberately: rules are pure functions of settings, time and existing
 * bookings, and a rule that needs a database to be tested is a rule nobody will test
 * thoroughly. Wiring and database semantics are covered separately by the integration suite.
 *
 * <p>Times are chosen inside a Wednesday 10:00-23:00 window (matching V5) with "now" fixed at
 * 09:00 club-local, so every test states its intent through the times it picks rather than
 * through arithmetic on the current moment.
 */
@ExtendWith(MockitoExtension.class)
class BookingValidatorTest {

    private static final ZoneId LONDON = ZoneId.of("Europe/London");

    /** A Wednesday, deliberately not near a DST boundary. */
    private static final LocalDate WEDNESDAY = LocalDate.of(2026, 8, 19);

    @Mock private SnookerTableRepository tableRepository;
    @Mock private BookingRepository bookingRepository;
    @Mock private MaintenanceBlockRepository blockRepository;
    @Mock private OpeningHoursRepository openingHoursRepository;
    @Mock private BookingSettingsRepository bookingSettingsRepository;

    private BookingValidator validator;
    private ClubClock clubClock;
    private SnookerTable table;

    @BeforeEach
    void setUp() {
        Instant now = clubTime(LocalTime.of(9, 0));
        clubClock = new ClubClock(Clock.fixed(now, LONDON), "Europe/London");
        validator = new BookingValidator(
                tableRepository,
                bookingRepository,
                blockRepository,
                openingHoursRepository,
                bookingSettingsRepository,
                new SlotGenerator(clubClock),
                clubClock);
        table = TestFixtures.table(1L, "Table 1");
    }

    /** Stubs the collaborators every "happy path" needs. Called only where relevant, to
     * keep Mockito's strict stubbing meaningful. */
    private void givenOpenClubWithDefaultSettings() {
        when(bookingSettingsRepository.findSingleton())
                .thenReturn(Optional.of(TestFixtures.bookingSettings()));
        // findByDayValue, not findForDay: the latter is a default interface method, which on a
        // mock returns null instead of running its body. Stubbing the abstract method it
        // delegates to is what makes the default logic actually execute.
        when(openingHoursRepository.findByDayValue(anyShort()))
                .thenReturn(Optional.of(
                        TestFixtures.openingHours(LocalTime.of(10, 0), LocalTime.of(23, 0))));
    }

    private void givenTableExists() {
        when(tableRepository.findById(1L)).thenReturn(Optional.of(table));
    }

    private void givenNoBlocksOrBookings() {
        when(blockRepository.findOverlappingForTable(anyLong(), any(), any())).thenReturn(List.of());
        when(bookingRepository.findOverlappingForTable(anyLong(), any(), any(), any()))
                .thenReturn(List.of());
    }

    @Test
    @DisplayName("accepts a booking that satisfies every rule")
    void acceptsAValidBooking() {
        givenOpenClubWithDefaultSettings();
        givenTableExists();
        givenNoBlocksOrBookings();

        SnookerTable validated = validator.validate(
                command(LocalTime.of(19, 0), 60), BookingPolicy.online());

        assertThat(validated.getId()).isEqualTo(1L);
    }

    @Nested
    @DisplayName("duration")
    class DurationRules {

        @ParameterizedTest(name = "{0} minutes is rejected")
        @ValueSource(ints = {0, -30, 15, 45, 270})
        @DisplayName("rejects durations that are not permitted")
        void rejectsInvalidDurations(int minutes) {
            when(bookingSettingsRepository.findSingleton())
                    .thenReturn(Optional.of(TestFixtures.bookingSettings()));

            assertThatThrownBy(() ->
                            validator.validate(command(LocalTime.of(19, 0), minutes), BookingPolicy.online()))
                    .isInstanceOf(BusinessRuleException.class)
                    .extracting(ex -> ((BusinessRuleException) ex).getCode())
                    .isEqualTo(ErrorCode.INVALID_DURATION);
        }

        @ParameterizedTest(name = "{0} minutes is accepted")
        @ValueSource(ints = {30, 60, 90, 240})
        @DisplayName("accepts every duration the settings permit")
        void acceptsPermittedDurations(int minutes) {
            givenOpenClubWithDefaultSettings();
            givenTableExists();
            givenNoBlocksOrBookings();

            // 10:00 start so even a 240-minute booking finishes well before closing.
            assertThatCode(() ->
                            validator.validate(command(LocalTime.of(10, 0), minutes), BookingPolicy.online()))
                    .doesNotThrowAnyException();
        }

        @Test
        @DisplayName("the boundary durations themselves are allowed")
        void boundaryDurationsAreInclusive() {
            givenOpenClubWithDefaultSettings();
            givenTableExists();
            givenNoBlocksOrBookings();

            // Min and max are inclusive bounds, not exclusive — an off-by-one here would
            // silently forbid the shortest and longest bookings the club advertises.
            assertThatCode(() -> validator.validate(command(LocalTime.of(10, 0), 30), BookingPolicy.online()))
                    .doesNotThrowAnyException();
            assertThatCode(() -> validator.validate(command(LocalTime.of(10, 0), 240), BookingPolicy.online()))
                    .doesNotThrowAnyException();
        }
    }

    @Nested
    @DisplayName("notice period")
    class NoticeRules {

        @Test
        @DisplayName("rejects a booking inside the notice period")
        void rejectsInsufficientNotice() {
            when(bookingSettingsRepository.findSingleton())
                    .thenReturn(Optional.of(TestFixtures.bookingSettings()));

            // Now is 09:00 and the notice period is 60 minutes, so 09:30 is too soon.
            assertThatThrownBy(() ->
                            validator.validate(command(LocalTime.of(9, 30), 60), BookingPolicy.online()))
                    .isInstanceOf(BusinessRuleException.class)
                    .extracting(ex -> ((BusinessRuleException) ex).getCode())
                    .isEqualTo(ErrorCode.INSUFFICIENT_NOTICE);
        }

        @Test
        @DisplayName("the notice boundary is inclusive")
        void noticeBoundaryIsInclusive() {
            givenOpenClubWithDefaultSettings();
            givenTableExists();
            givenNoBlocksOrBookings();

            // Exactly 60 minutes ahead satisfies a 60-minute rule. Getting this wrong makes
            // the club's own advertised rule reject a booking that meets it.
            assertThatCode(() -> validator.validate(command(LocalTime.of(10, 0), 60), BookingPolicy.online()))
                    .doesNotThrowAnyException();
        }

        @Test
        @DisplayName("staff may book inside the notice period")
        void staffBypassNotice() {
            givenOpenClubWithDefaultSettings();
            givenTableExists();
            givenNoBlocksOrBookings();

            // 10:00 rather than 09:30, because staff bypass *notice*, not opening hours —
            // and the club is shut at 09:30 whoever is asking.
            assertThatCode(() -> validator.validate(command(LocalTime.of(10, 0), 60), BookingPolicy.staff()))
                    .doesNotThrowAnyException();
        }

        @Test
        @DisplayName("nobody may book a start time that has already passed")
        void rejectsThePastEvenForStaff() {
            when(bookingSettingsRepository.findSingleton())
                    .thenReturn(Optional.of(TestFixtures.bookingSettings()));

            // Not a policy an admin can waive: a table cannot be occupied retroactively.
            assertThatThrownBy(() ->
                            validator.validate(command(LocalTime.of(8, 0), 60), BookingPolicy.staff()))
                    .isInstanceOf(BusinessRuleException.class)
                    .extracting(ex -> ((BusinessRuleException) ex).getCode())
                    .isEqualTo(ErrorCode.INSUFFICIENT_NOTICE);
        }
    }

    @Nested
    @DisplayName("advance window")
    class AdvanceRules {

        @Test
        @DisplayName("rejects a booking beyond the advance window")
        void rejectsTooFarAhead() {
            when(bookingSettingsRepository.findSingleton())
                    .thenReturn(Optional.of(TestFixtures.bookingSettings()));

            Instant tooFar = clubClock.toInstant(WEDNESDAY.plusDays(31), LocalTime.of(19, 0));

            assertThatThrownBy(() -> validator.validate(
                            commandAt(tooFar, 60), BookingPolicy.online()))
                    .isInstanceOf(BusinessRuleException.class)
                    .extracting(ex -> ((BusinessRuleException) ex).getCode())
                    .isEqualTo(ErrorCode.TOO_FAR_IN_ADVANCE);
        }

        @Test
        @DisplayName("the last day of the advance window is allowed")
        void advanceBoundaryIsInclusive() {
            when(bookingSettingsRepository.findSingleton())
                    .thenReturn(Optional.of(TestFixtures.bookingSettings()));
            when(openingHoursRepository.findByDayValue(anyShort()))
                    .thenReturn(Optional.of(
                            TestFixtures.openingHours(LocalTime.of(10, 0), LocalTime.of(23, 0))));
            givenTableExists();
            givenNoBlocksOrBookings();

            // Day 30 of a 30-day window is inside it; day 31 is not.
            Instant lastDay = clubClock.toInstant(WEDNESDAY.plusDays(30), LocalTime.of(19, 0));

            assertThatCode(() -> validator.validate(commandAt(lastDay, 60), BookingPolicy.online()))
                    .doesNotThrowAnyException();
        }

        @Test
        @DisplayName("staff may book beyond the advance window")
        void staffBypassAdvanceWindow() {
            when(bookingSettingsRepository.findSingleton())
                    .thenReturn(Optional.of(TestFixtures.bookingSettings()));
            when(openingHoursRepository.findByDayValue(anyShort()))
                    .thenReturn(Optional.of(
                            TestFixtures.openingHours(LocalTime.of(10, 0), LocalTime.of(23, 0))));
            givenTableExists();
            givenNoBlocksOrBookings();

            Instant nextYear = clubClock.toInstant(WEDNESDAY.plusDays(300), LocalTime.of(19, 0));

            assertThatCode(() -> validator.validate(commandAt(nextYear, 60), BookingPolicy.staff()))
                    .doesNotThrowAnyException();
        }
    }

    @Nested
    @DisplayName("table state")
    class TableRules {

        @Test
        @DisplayName("rejects a table that does not exist, as a 404")
        void rejectsUnknownTable() {
            when(bookingSettingsRepository.findSingleton())
                    .thenReturn(Optional.of(TestFixtures.bookingSettings()));
            when(tableRepository.findById(1L)).thenReturn(Optional.empty());

            assertThatThrownBy(() ->
                            validator.validate(command(LocalTime.of(19, 0), 60), BookingPolicy.online()))
                    .isInstanceOf(NotFoundException.class);
        }

        @Test
        @DisplayName("rejects an out-of-service table for staff too")
        void rejectsInactiveTableRegardlessOfPolicy() {
            when(bookingSettingsRepository.findSingleton())
                    .thenReturn(Optional.of(TestFixtures.bookingSettings()));
            SnookerTable inactive = TestFixtures.table(
                    1L, "Table 1", uk.co.club.booking.domain.table.TableType.SNOOKER, false);
            when(tableRepository.findById(1L)).thenReturn(Optional.of(inactive));

            // BookingPolicy has no field to waive this, by design; the test documents that
            // staff genuinely cannot book a table that is out of service.
            assertThatThrownBy(() ->
                            validator.validate(command(LocalTime.of(19, 0), 60), BookingPolicy.staff()))
                    .isInstanceOf(BusinessRuleException.class)
                    .extracting(ex -> ((BusinessRuleException) ex).getCode())
                    .isEqualTo(ErrorCode.TABLE_INACTIVE);
        }
    }

    @Nested
    @DisplayName("opening hours")
    class OpeningHoursRules {

        @Test
        @DisplayName("rejects a booking on a day the club is closed")
        void rejectsClosedDay() {
            when(bookingSettingsRepository.findSingleton())
                    .thenReturn(Optional.of(TestFixtures.bookingSettings()));
            // The table must exist and be active, or an earlier rule rejects first and this
            // would pass without ever reaching the opening-hours check.
            givenTableExists();
            when(openingHoursRepository.findByDayValue(anyShort()))
                    .thenReturn(Optional.of(TestFixtures.closedDay()));

            assertThatThrownBy(() ->
                            validator.validate(command(LocalTime.of(19, 0), 60), BookingPolicy.online()))
                    .isInstanceOf(BusinessRuleException.class)
                    .extracting(ex -> ((BusinessRuleException) ex).getCode())
                    .isEqualTo(ErrorCode.CLUB_CLOSED);
        }

        @Test
        @DisplayName("rejects a booking starting before opening time")
        void rejectsBeforeOpening() {
            when(bookingSettingsRepository.findSingleton())
                    .thenReturn(Optional.of(TestFixtures.bookingSettings()));
            when(openingHoursRepository.findByDayValue(anyShort()))
                    .thenReturn(Optional.of(
                            TestFixtures.openingHours(LocalTime.of(10, 0), LocalTime.of(23, 0))));
            givenTableExists();

            // 09:30 is after "now" plus notice would allow... no: it is before opening.
            // Uses a start time far enough ahead that only the opening-hours rule can reject it.
            Instant beforeOpening = clubClock.toInstant(WEDNESDAY.plusDays(1), LocalTime.of(9, 0));

            assertThatThrownBy(() ->
                            validator.validate(commandAt(beforeOpening, 60), BookingPolicy.online()))
                    .isInstanceOf(BusinessRuleException.class)
                    .extracting(ex -> ((BusinessRuleException) ex).getCode())
                    .isEqualTo(ErrorCode.CLUB_CLOSED);
        }

        @Test
        @DisplayName("rejects a booking that would run past closing time")
        void rejectsRunningPastClosing() {
            givenOpenClubWithDefaultSettings();
            givenTableExists();

            // 22:30 + 60 minutes = 23:30, past the 23:00 close. This is the case a naive
            // "is the start time within opening hours?" check waves through.
            assertThatThrownBy(() ->
                            validator.validate(command(LocalTime.of(22, 30), 60), BookingPolicy.online()))
                    .isInstanceOf(BusinessRuleException.class)
                    .extracting(ex -> ((BusinessRuleException) ex).getCode())
                    .isEqualTo(ErrorCode.CLUB_CLOSED);
        }

        @Test
        @DisplayName("a booking ending exactly at closing time is allowed")
        void endingAtClosingTimeIsAllowed() {
            givenOpenClubWithDefaultSettings();
            givenTableExists();
            givenNoBlocksOrBookings();

            // 22:00-23:00 finishes precisely as the club closes, which is permitted; treating
            // this as "past closing" would cost the club its last slot every single day.
            assertThatCode(() -> validator.validate(command(LocalTime.of(22, 0), 60), BookingPolicy.online()))
                    .doesNotThrowAnyException();
        }
    }

    @Nested
    @DisplayName("conflicts")
    class ConflictRules {

        @Test
        @DisplayName("rejects a booking during a maintenance block, for staff too")
        void rejectsMaintenanceBlockRegardlessOfPolicy() {
            givenOpenClubWithDefaultSettings();
            givenTableExists();
            Instant start = clubTime(LocalTime.of(19, 0));
            when(blockRepository.findOverlappingForTable(anyLong(), any(), any()))
                    .thenReturn(List.of(TestFixtures.block(
                            table, start, start.plus(Duration.ofHours(2)), "Re-clothing")));

            assertThatThrownBy(() ->
                            validator.validate(command(LocalTime.of(19, 0), 60), BookingPolicy.staff()))
                    .isInstanceOf(BusinessRuleException.class)
                    .extracting(ex -> ((BusinessRuleException) ex).getCode())
                    .isEqualTo(ErrorCode.TABLE_UNDER_MAINTENANCE);
        }

        @Test
        @DisplayName("rejects an overlapping confirmed booking")
        void rejectsOverlappingBooking() {
            givenOpenClubWithDefaultSettings();
            givenTableExists();
            when(blockRepository.findOverlappingForTable(anyLong(), any(), any())).thenReturn(List.of());
            Instant start = clubTime(LocalTime.of(19, 0));
            when(bookingRepository.findOverlappingForTable(anyLong(), any(), any(), any()))
                    .thenReturn(List.of(TestFixtures.booking(
                            table, start, start.plus(Duration.ofHours(1)), BookingStatus.CONFIRMED)));

            assertThatThrownBy(() ->
                            validator.validate(command(LocalTime.of(19, 0), 60), BookingPolicy.online()))
                    .isInstanceOf(BusinessRuleException.class)
                    .extracting(ex -> ((BusinessRuleException) ex).getCode())
                    .isEqualTo(ErrorCode.SLOT_UNAVAILABLE);
        }

        @Test
        @DisplayName("a hold that has already lapsed does not block the slot")
        void lapsedHoldDoesNotBlock() {
            givenOpenClubWithDefaultSettings();
            givenTableExists();
            when(blockRepository.findOverlappingForTable(anyLong(), any(), any())).thenReturn(List.of());
            Instant start = clubTime(LocalTime.of(19, 0));
            // Expired an hour before "now": the database constraint still sees this row, but
            // the customer must not be told the slot is taken by an abandoned checkout.
            when(bookingRepository.findOverlappingForTable(anyLong(), any(), any(), any()))
                    .thenReturn(List.of(TestFixtures.pendingHold(
                            table,
                            start,
                            start.plus(Duration.ofHours(1)),
                            clubTime(LocalTime.of(8, 0)))));

            assertThatCode(() -> validator.validate(command(LocalTime.of(19, 0), 60), BookingPolicy.online()))
                    .doesNotThrowAnyException();
        }

        @Test
        @DisplayName("a live hold does block the slot")
        void liveHoldBlocks() {
            givenOpenClubWithDefaultSettings();
            givenTableExists();
            when(blockRepository.findOverlappingForTable(anyLong(), any(), any())).thenReturn(List.of());
            Instant start = clubTime(LocalTime.of(19, 0));
            when(bookingRepository.findOverlappingForTable(anyLong(), any(), any(), any()))
                    .thenReturn(List.of(TestFixtures.pendingHold(
                            table,
                            start,
                            start.plus(Duration.ofHours(1)),
                            clubTime(LocalTime.of(9, 10)))));

            assertThatThrownBy(() ->
                            validator.validate(command(LocalTime.of(19, 0), 60), BookingPolicy.online()))
                    .isInstanceOf(BusinessRuleException.class)
                    .extracting(ex -> ((BusinessRuleException) ex).getCode())
                    .isEqualTo(ErrorCode.SLOT_UNAVAILABLE);
        }
    }

    @Test
    @DisplayName("reports the most specific applicable reason, not merely the first failure")
    void rulesAreOrderedMostInformativeFirst() {
        when(bookingSettingsRepository.findSingleton())
                .thenReturn(Optional.of(TestFixtures.bookingSettings()));
        SnookerTable inactive = TestFixtures.table(
                1L, "Table 1", uk.co.club.booking.domain.table.TableType.SNOOKER, false);
        when(tableRepository.findById(1L)).thenReturn(Optional.of(inactive));

        // No opening-hours stub, deliberately. The table check runs first, so the validator
        // never consults opening hours at all — and Mockito's strict stubbing proves it: adding
        // a stub here fails the test with UnnecessaryStubbingException. That failure is the
        // assertion. The customer is told the table is out of service, which is the actionable
        // fact; "we are closed" would send them to pick another day and hit the same wall.
        assertThatThrownBy(() ->
                        validator.validate(command(LocalTime.of(19, 0), 60), BookingPolicy.online()))
                .isInstanceOf(BusinessRuleException.class)
                .extracting(ex -> ((BusinessRuleException) ex).getCode())
                .isEqualTo(ErrorCode.TABLE_INACTIVE);
    }

    // ------------------------------------------------------------------ helpers

    /** The given club-local time on the fixed Wednesday, as an instant. */
    private static Instant clubTime(LocalTime time) {
        return java.time.ZonedDateTime.of(WEDNESDAY, time, LONDON).toInstant();
    }

    private CreateBookingCommand command(LocalTime startTime, int minutes) {
        return commandAt(clubTime(startTime), minutes);
    }

    private CreateBookingCommand commandAt(Instant startAt, int minutes) {
        return new CreateBookingCommand(
                1L,
                startAt,
                minutes,
                null,
                "Test Customer",
                "test@example.test",
                null,
                null,
                BookingSource.ONLINE,
                null);
    }
}

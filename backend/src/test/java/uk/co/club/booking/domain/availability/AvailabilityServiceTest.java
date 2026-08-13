package uk.co.club.booking.domain.availability;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyShort;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import uk.co.club.booking.common.time.ClubClock;
import uk.co.club.booking.domain.booking.Booking;
import uk.co.club.booking.domain.booking.BookingPolicy;
import uk.co.club.booking.domain.booking.BookingRepository;
import uk.co.club.booking.domain.booking.BookingStatus;
import uk.co.club.booking.domain.club.BookingSettings;
import uk.co.club.booking.domain.club.BookingSettingsRepository;
import uk.co.club.booking.domain.club.OpeningHoursRepository;
import uk.co.club.booking.domain.club.PricingService;
import uk.co.club.booking.domain.table.MaintenanceBlockRepository;
import uk.co.club.booking.domain.table.SnookerTable;
import uk.co.club.booking.domain.table.SnookerTableRepository;
import uk.co.club.booking.domain.table.TableType;
import uk.co.club.booking.support.TestFixtures;

/**
 * The date under test is Thursday 20 August 2026 (BST, +01:00). "Now" is fixed at 09:00
 * local, an hour before the club opens at 10:00, so notice-period behaviour is
 * predictable.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AvailabilityServiceTest {

    private static final LocalDate DATE = LocalDate.of(2026, 8, 20);
    private static final Instant NOW = Instant.parse("2026-08-20T08:00:00Z"); // 09:00 BST

    @Mock private SnookerTableRepository tableRepository;
    @Mock private BookingRepository bookingRepository;
    @Mock private MaintenanceBlockRepository blockRepository;
    @Mock private OpeningHoursRepository openingHoursRepository;
    @Mock private BookingSettingsRepository bookingSettingsRepository;
    @Mock private PricingService pricingService;

    private ClubClock clubClock;
    private AvailabilityService service;
    private SnookerTable table1;

    @BeforeEach
    void setUp() {
        clubClock = new ClubClock(Clock.fixed(NOW, ZoneOffset.UTC), "Europe/London");
        service = new AvailabilityService(
                tableRepository,
                bookingRepository,
                blockRepository,
                openingHoursRepository,
                bookingSettingsRepository,
                new SlotGenerator(clubClock),
                pricingService,
                clubClock);

        table1 = TestFixtures.table(1L, "Table 1");

        givenSettings(TestFixtures.bookingSettings());
        givenOpen(LocalTime.of(10, 0), LocalTime.of(23, 0));
        givenTables(table1);
        when(bookingRepository.findOverlapping(any(), any(), any())).thenReturn(List.of());
        when(blockRepository.findOverlapping(any(), any())).thenReturn(List.of());
        when(pricingService.hourlyRatePence(any(), any())).thenReturn(1200);
        // The grid asks for a rate per slot, since a rule narrowed by time of day makes the
        // rate vary across the row. A flat array keeps these tests about availability; the
        // rate actually varying is covered by SettingsAffectAvailabilityIT against real rules.
        when(pricingService.hourlyRatesPence(any(), any())).thenAnswer(invocation -> {
            List<?> starts = invocation.getArgument(1);
            int[] rates = new int[starts.size()];
            java.util.Arrays.fill(rates, 1200);
            return rates;
        });
        when(pricingService.quotePence(any(), any(), any())).thenReturn(1800);
    }

    private void givenSettings(BookingSettings settings) {
        when(bookingSettingsRepository.findSingleton()).thenReturn(Optional.of(settings));
    }

    private void givenOpen(LocalTime open, LocalTime close) {
        when(openingHoursRepository.findByDayValue(anyShort()))
                .thenReturn(Optional.of(TestFixtures.openingHours(open, close)));
    }

    private void givenTables(SnookerTable... tables) {
        when(tableRepository.findAllByActiveTrueOrderByDisplayOrderAscIdAsc())
                .thenReturn(List.of(tables));
    }

    private Instant local(int hour, int minute) {
        return clubClock.toInstant(DATE, LocalTime.of(hour, minute));
    }

    private SlotView slotAt(DayAvailability day, LocalTime time) {
        return day.tables().getFirst().slots().stream()
                .filter(slot -> slot.startTime().equals(time))
                .findFirst()
                .orElseThrow(() -> new AssertionError("No slot at " + time));
    }

    @Test
    void buildsGridForAnOpenDay() {
        DayAvailability day = service.availability(DATE, null, null);

        assertThat(day.clubOpen()).isTrue();
        assertThat(day.dayUnavailableReason()).isNull();
        assertThat(day.timezone()).isEqualTo("Europe/London");
        assertThat(day.openingTime()).isEqualTo(LocalTime.of(10, 0));
        assertThat(day.slotTimes()).hasSize(26).startsWith(LocalTime.of(10, 0));
        assertThat(day.tables()).hasSize(1);
    }

    @Test
    void offersOnlyPermittedDurations() {
        DayAvailability day = service.availability(DATE, null, null);

        // 30..240 in 30-minute steps.
        assertThat(day.durationOptions()).hasSize(8);
        assertThat(day.durationOptions().getFirst().minutes()).isEqualTo(30);
        assertThat(day.durationOptions().getLast().minutes()).isEqualTo(240);
        assertThat(day.durationOptions())
                .extracting(DayAvailability.DurationOption::label)
                .contains("30 mins", "1 hour", "1 hour 30 mins", "4 hours");
    }

    @Test
    void closedDayReportsClubClosedAndNoSlots() {
        when(openingHoursRepository.findByDayValue(anyShort()))
                .thenReturn(Optional.of(TestFixtures.closedDay()));

        DayAvailability day = service.availability(DATE, null, null);

        assertThat(day.clubOpen()).isFalse();
        assertThat(day.dayUnavailableReason()).isEqualTo(UnavailableReason.CLUB_CLOSED);
        assertThat(day.slotTimes()).isEmpty();
        assertThat(day.tables()).isEmpty();
    }

    @Test
    void dateBeyondAdvanceWindowIsRejectedForTheWholeDay() {
        LocalDate tooFar = LocalDate.of(2026, 8, 20).plusDays(31);

        DayAvailability day = service.availability(tooFar, null, null);

        assertThat(day.dayUnavailableReason()).isEqualTo(UnavailableReason.TOO_FAR_IN_ADVANCE);
        assertThat(day.tables()).isEmpty();
    }

    @Test
    void dateExactlyOnTheAdvanceBoundaryIsStillBookable() {
        LocalDate boundary = LocalDate.of(2026, 8, 20).plusDays(30);

        DayAvailability day = service.availability(boundary, null, null);

        assertThat(day.dayUnavailableReason()).isNull();
        assertThat(day.tables()).isNotEmpty();
    }

    @Test
    void pastDateIsReportedAsPast() {
        DayAvailability day = service.availability(DATE.minusDays(1), null, null);

        assertThat(day.dayUnavailableReason()).isEqualTo(UnavailableReason.PAST);
    }

    @Test
    void inactiveTableRowIsReturnedButEverySlotIsUnavailable() {
        SnookerTable inactive = TestFixtures.table(2L, "Table 2", TableType.SNOOKER, false);
        when(tableRepository.findAllById(any())).thenReturn(List.of(inactive));

        DayAvailability day = service.availability(DATE, null, List.of(2L));

        TableAvailability row = day.tables().getFirst();
        assertThat(row.tableActive()).isFalse();
        assertThat(row.slots())
                .allSatisfy(slot -> {
                    assertThat(slot.available()).isFalse();
                    assertThat(slot.reason()).isEqualTo(UnavailableReason.TABLE_INACTIVE);
                });
    }

    @Test
    void bookedSlotIsMarkedBooked() {
        Booking booking = TestFixtures.booking(
                table1, local(14, 0), local(15, 0), BookingStatus.CONFIRMED);
        when(bookingRepository.findOverlapping(any(), any(), any())).thenReturn(List.of(booking));

        DayAvailability day = service.availability(DATE, null, null);

        assertThat(slotAt(day, LocalTime.of(14, 0)).reason()).isEqualTo(UnavailableReason.BOOKED);
        assertThat(slotAt(day, LocalTime.of(14, 30)).reason()).isEqualTo(UnavailableReason.BOOKED);
        // Half-open: the 15:00 slot abuts the booking and must remain free.
        assertThat(slotAt(day, LocalTime.of(15, 0)).available()).isTrue();
        // As must the slot ending exactly when the booking starts.
        assertThat(slotAt(day, LocalTime.of(13, 30)).available()).isTrue();
    }

    @Test
    void liveHoldBlocksTheSlotButLapsedHoldDoesNot() {
        Booking liveHold = TestFixtures.pendingHold(
                table1, local(16, 0), local(17, 0), NOW.plusSeconds(600));
        Booking lapsedHold = TestFixtures.pendingHold(
                table1, local(18, 0), local(19, 0), NOW.minusSeconds(1));
        when(bookingRepository.findOverlapping(any(), any(), any()))
                .thenReturn(List.of(liveHold, lapsedHold));

        DayAvailability day = service.availability(DATE, null, null);

        assertThat(slotAt(day, LocalTime.of(16, 0)).reason()).isEqualTo(UnavailableReason.BOOKED);
        // The database constraint still sees the lapsed hold until the sweeper runs, but
        // keeping the slot dark would lose the club a booking for no reason.
        assertThat(slotAt(day, LocalTime.of(18, 0)).available()).isTrue();
    }

    @Test
    void maintenanceBlockIsReportedDistinctlyFromBooking() {
        when(blockRepository.findOverlapping(any(), any()))
                .thenReturn(List.of(TestFixtures.block(
                        table1, local(14, 0), local(18, 0), "Cloth replacement")));

        DayAvailability day = service.availability(DATE, null, null);

        assertThat(slotAt(day, LocalTime.of(14, 0)).reason())
                .isEqualTo(UnavailableReason.MAINTENANCE);
        assertThat(slotAt(day, LocalTime.of(17, 30)).reason())
                .isEqualTo(UnavailableReason.MAINTENANCE);
        assertThat(slotAt(day, LocalTime.of(18, 0)).available()).isTrue();
    }

    @Test
    void slotsInsideTheNoticePeriodAreRejected() {
        // Now is 09:00 local with 90 minutes' notice, so the cutoff is 10:30: the 10:00
        // slot is too soon, and 10:30 is exactly on the boundary and allowed.
        givenSettings(TestFixtures.bookingSettings(settings -> settings.setMinNoticeMinutes(90)));

        DayAvailability day = service.availability(DATE, null, null);

        assertThat(slotAt(day, LocalTime.of(10, 0)).reason())
                .isEqualTo(UnavailableReason.INSUFFICIENT_NOTICE);
        assertThat(slotAt(day, LocalTime.of(10, 30)).available()).isTrue();
    }

    @Test
    void noticePeriodBoundaryIsInclusive() {
        // Default 60 minutes' notice with now at 09:00 means 10:00 is exactly on the
        // boundary. A booking made with precisely the required notice must be allowed.
        DayAvailability day = service.availability(DATE, null, null);

        assertThat(slotAt(day, LocalTime.of(10, 0)).available()).isTrue();
    }

    @Test
    void availableButUnstartableSlotNearClosingIsDistinguished() {
        // Club closes at 23:00 and the minimum booking is 30 minutes, so 22:30 is the
        // last startable slot. Raise the minimum to 60 and 22:30 becomes free but
        // unstartable — the distinction the grid needs.
        givenSettings(TestFixtures.bookingSettings(settings -> settings.setMinDurationMinutes(60)));

        DayAvailability day = service.availability(DATE, null, null);
        SlotView lastSlot = slotAt(day, LocalTime.of(22, 30));

        assertThat(lastSlot.available()).isTrue();
        assertThat(lastSlot.maxDurationMinutes()).isZero();
        assertThat(lastSlot.reason()).isEqualTo(UnavailableReason.INSUFFICIENT_REMAINING_TIME);
    }

    @Test
    void requestedDurationDrivesBookabilityIndependentlyOfOccupancy() {
        DayAvailability day = service.availability(DATE, 90, null);

        SlotView midday = slotAt(day, LocalTime.of(12, 0));
        assertThat(midday.available()).isTrue();
        assertThat(midday.bookableForRequestedDuration()).isTrue();
        assertThat(midday.pricePenceForRequestedDuration()).isEqualTo(1800);

        // 22:00 is unoccupied, but only 60 minutes remain before closing, so a
        // 90-minute booking cannot start there. This is the pair of booleans diverging.
        SlotView nearClose = slotAt(day, LocalTime.of(22, 0));
        assertThat(nearClose.available()).isTrue();
        assertThat(nearClose.bookableForRequestedDuration()).isFalse();
        assertThat(nearClose.pricePenceForRequestedDuration()).isNull();
    }

    @Test
    void maxDurationIsLimitedByTheNextBooking() {
        Booking booking = TestFixtures.booking(
                table1, local(15, 0), local(16, 0), BookingStatus.CONFIRMED);
        when(bookingRepository.findOverlapping(any(), any(), any())).thenReturn(List.of(booking));

        DayAvailability day = service.availability(DATE, null, null);

        // 14:00 has exactly one free hour before the 15:00 booking.
        assertThat(slotAt(day, LocalTime.of(14, 0)).maxDurationMinutes()).isEqualTo(60);
        assertThat(slotAt(day, LocalTime.of(14, 30)).maxDurationMinutes()).isEqualTo(30);
    }

    @Test
    void maxDurationNeverExceedsTheConfiguredMaximum() {
        DayAvailability day = service.availability(DATE, null, null);

        // Midday has far more than 4 hours free, but 240 is the configured ceiling.
        assertThat(slotAt(day, LocalTime.of(12, 0)).maxDurationMinutes()).isEqualTo(240);
    }

    @Test
    void noRequestedDurationLeavesBookabilityUnanswered() {
        DayAvailability day = service.availability(DATE, null, null);

        assertThat(slotAt(day, LocalTime.of(12, 0)).bookableForRequestedDuration()).isNull();
        assertThat(slotAt(day, LocalTime.of(12, 0)).pricePenceForRequestedDuration()).isNull();
    }

    @Test
    void durationNotMatchingTheIncrementIsNeverBookable() {
        DayAvailability day = service.availability(DATE, 45, null);

        assertThat(day.tables().getFirst().slots())
                .allSatisfy(slot ->
                        assertThat(slot.bookableForRequestedDuration()).isFalse());
    }

    @Test
    void slotStartsCarryBothLocalTimeAndAbsoluteInstant() {
        DayAvailability day = service.availability(DATE, null, null);
        SlotView slot = slotAt(day, LocalTime.of(12, 0));

        // 12:00 BST is 11:00 UTC. The client posts the instant back, avoiding any
        // ambiguity about which 01:30 it meant on a transition day.
        assertThat(slot.startAt()).isEqualTo(Instant.parse("2026-08-20T11:00:00Z"));
        assertThat(slot.endTime()).isEqualTo(LocalTime.of(12, 30));
    }

    /**
     * Builds a service whose clock reads {@code hour:minute} on the day under test, so a
     * test can stand in the middle of a trading day rather than an hour before opening.
     */
    private AvailabilityService serviceAt(int hour, int minute) {
        ClubClock midDay = new ClubClock(
                Clock.fixed(
                        LocalDate.of(2026, 8, 20)
                                .atTime(hour, minute)
                                .atZone(java.time.ZoneId.of("Europe/London"))
                                .toInstant(),
                        ZoneOffset.UTC),
                "Europe/London");
        return new AvailabilityService(
                tableRepository,
                bookingRepository,
                blockRepository,
                openingHoursRepository,
                bookingSettingsRepository,
                new SlotGenerator(midDay),
                pricingService,
                midDay);
    }

    @Test
    void dropsSlotsThatHaveAlreadyPassed() {
        // Arriving at 14:15 previously rendered 10:00 onwards as greyed columns: four hours
        // of dead grid to scroll past before reaching anything bookable.
        DayAvailability day = serviceAt(14, 15).availability(DATE, null, null);

        assertThat(day.slotTimes())
                .as("the morning is over and should not occupy the grid")
                .doesNotContain(LocalTime.of(10, 0), LocalTime.of(13, 0), LocalTime.of(14, 0));
        assertThat(day.slotTimes().getFirst())
                .as("the axis starts at the next slot still to come")
                .isEqualTo(LocalTime.of(14, 30));
    }

    @Test
    void keepsSlotsExcludedOnlyByTheNoticePeriod() {
        // Notice is 60 minutes, so at 14:15 the 14:30 and 15:00 slots are real trading time
        // the customer cannot claim yet. Hiding them would misreport the club's hours; they
        // belong on the grid, greyed, saying why.
        DayAvailability day = serviceAt(14, 15).availability(DATE, null, null);

        assertThat(day.slotTimes()).contains(LocalTime.of(14, 30), LocalTime.of(15, 0));
        assertThat(slotAt(day, LocalTime.of(14, 30)).reason())
                .isEqualTo(UnavailableReason.INSUFFICIENT_NOTICE);
    }

    @Test
    void leavesAFutureDayFullyIntact() {
        // The filter compares against now, so a later date must keep its whole axis. Trimming
        // it would hide tomorrow morning from someone booking today.
        DayAvailability day = serviceAt(14, 15).availability(DATE.plusDays(1), null, null);

        assertThat(day.slotTimes()).hasSize(26).startsWith(LocalTime.of(10, 0));
    }

    @Test
    void reportsADayWhoseSlotsHaveAllGoneRatherThanAnEmptyGrid() {
        // After the last slot there is nothing to render. A grid with no columns is an empty
        // box that explains nothing, so this is a whole-day condition instead.
        DayAvailability day = serviceAt(23, 30).availability(DATE, null, null);

        assertThat(day.slotTimes()).isEmpty();
        assertThat(day.tables()).isEmpty();
        assertThat(day.dayUnavailableReason()).isEqualTo(UnavailableReason.PAST);
        assertThat(day.clubOpen())
                .as("the club did open today; its trading day is simply over")
                .isTrue();
    }

    // The staff grid. These assert that the grid and BookingValidator agree, because they are
    // handed the same BookingPolicy — a slot offered here that the create endpoint then
    // refuses, or greyed here that it would have accepted, is the failure being guarded.

    @Test
    void staffAreOfferedSlotsInsideTheNoticePeriod() {
        // BookingPolicy.staff() lifts min-notice, so "in fifteen minutes" is a booking the
        // telephone endpoint accepts. Greying it here would show staff a slot as unbookable
        // that the very next request would take.
        DayAvailability day =
                serviceAt(14, 15).availability(DATE, null, null, BookingPolicy.staff());

        SlotView soon = slotAt(day, LocalTime.of(14, 30));
        assertThat(soon.reason()).isNull();
        assertThat(soon.available()).isTrue();
    }

    @Test
    void customersAreStillHeldToTheNoticePeriod() {
        // The other half of the pair: lifting notice for staff must not lift it for everyone.
        DayAvailability day =
                serviceAt(14, 15).availability(DATE, null, null, BookingPolicy.online());

        assertThat(slotAt(day, LocalTime.of(14, 30)).reason())
                .isEqualTo(UnavailableReason.INSUFFICIENT_NOTICE);
    }

    @Test
    void staffSeeAFullGridBeyondTheCustomerAdvanceWindow() {
        // Advance is 30 days and staff may book past it. As a whole-day PAST/TOO_FAR condition
        // this rendered as an empty box, so staff had no grid at all for a date they can sell.
        LocalDate tooFar = DATE.plusDays(31);

        DayAvailability day = service.availability(tooFar, null, null, BookingPolicy.staff());

        assertThat(day.dayUnavailableReason()).isNull();
        assertThat(day.tables()).isNotEmpty();
        assertThat(day.slotTimes()).isNotEmpty();
    }

    @Test
    void staffCannotBookIntoThePast() {
        // The policy lifts notice and advance, and nothing else. A past date stays past: there
        // is no field on BookingPolicy for overriding it, and there should not be.
        //
        // Two guards independently produce this: the past-date check in wholeDayReason, and
        // the elapsed-slot filter, which empties yesterday's axis entirely. They return the
        // same reason and the same clubOpen, so this asserts the outcome and cannot isolate
        // either one — mutating away the date check leaves the test green because the filter
        // still catches it. That redundancy is the point worth recording: staff cannot reach
        // a past date through either route.
        DayAvailability day =
                service.availability(DATE.minusDays(1), null, null, BookingPolicy.staff());

        assertThat(day.dayUnavailableReason()).isEqualTo(UnavailableReason.PAST);
        assertThat(day.tables()).isEmpty();
    }

    @Test
    void staffStillCannotBookAnOccupiedSlot() {
        // The physical-world rules are not policy. A table someone is on is unavailable to
        // staff exactly as it is to a customer.
        Booking booking =
                TestFixtures.booking(table1, local(19, 0), local(20, 0), BookingStatus.CONFIRMED);
        when(bookingRepository.findOverlapping(any(), any(), any())).thenReturn(List.of(booking));

        DayAvailability day = service.availability(DATE, null, null, BookingPolicy.staff());

        assertThat(slotAt(day, LocalTime.of(19, 0)).reason()).isEqualTo(UnavailableReason.BOOKED);
    }

    @Test
    void staffStillCannotBookAMaintenanceBlock() {
        when(blockRepository.findOverlapping(any(), any()))
                .thenReturn(List.of(TestFixtures.block(table1, local(15, 0), local(16, 0), "Re-clothing")));

        DayAvailability day = service.availability(DATE, null, null, BookingPolicy.staff());

        assertThat(slotAt(day, LocalTime.of(15, 0)).reason())
                .isEqualTo(UnavailableReason.MAINTENANCE);
    }

    @Test
    void theDefaultOverloadIsTheCustomerPolicy() {
        // The public endpoint calls the three-argument overload. If that ever defaulted to
        // staff(), every customer would silently gain the staff freedoms.
        DayAvailability day = serviceAt(14, 15).availability(DATE, null, null);

        assertThat(slotAt(day, LocalTime.of(14, 30)).reason())
                .isEqualTo(UnavailableReason.INSUFFICIENT_NOTICE);
    }
}

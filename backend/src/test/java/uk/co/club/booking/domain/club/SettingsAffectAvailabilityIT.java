package uk.co.club.booking.domain.club;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import uk.co.club.booking.common.error.BusinessRuleException;
import uk.co.club.booking.common.time.ClubClock;
import uk.co.club.booking.domain.availability.AvailabilityService;
import uk.co.club.booking.domain.availability.DayAvailability;
import uk.co.club.booking.domain.booking.BookingPolicy;
import uk.co.club.booking.domain.booking.BookingService;
import uk.co.club.booking.domain.booking.BookingSource;
import uk.co.club.booking.domain.booking.BookingStatus;
import uk.co.club.booking.domain.booking.CreateBookingCommand;
import uk.co.club.booking.support.AbstractIntegrationTest;
import uk.co.club.booking.support.IntegrationFixtures;

/**
 * Phase 6's hard gate: every setting must visibly change what a customer can do.
 *
 * <p>A settings screen that saves to the database but changes nothing a customer experiences
 * is worse than no settings screen — staff believe they have closed on Christmas Day. So each
 * test here writes a setting through {@code SettingsService} and then asserts the effect
 * through {@code AvailabilityService} and {@code BookingService}: the same paths a customer's
 * browser drives. Nothing is asserted by reading back the settings row.
 *
 * <p>The plan called for this as a Playwright spec. Playwright is not set up, so it is an
 * integration test instead — it exercises the real engine against real PostgreSQL, but it does
 * not prove the browser renders the result. That gap is recorded in the README.
 *
 * <p>The other half of the contract is the negative one: a settings change must
 * <em>not</em> retroactively invalidate bookings the club has already sold. That is asserted
 * alongside, because the two properties are easy to trade off against each other by accident.
 */
class SettingsAffectAvailabilityIT extends AbstractIntegrationTest {

    @Autowired private SettingsService settingsService;
    @Autowired private AvailabilityService availabilityService;
    @Autowired private BookingService bookingService;
    @Autowired private IntegrationFixtures fixtures;
    @Autowired private ClubClock clubClock;

    private long tableId;
    private long adminId;
    private LocalDate day;

    @BeforeEach
    void setUp() {
        tableId = fixtures.aTable("Table 1");
        adminId = fixtures.anAdmin("settings-admin@test.local", "AdminPass123!");
        // Far enough ahead to sit inside the default 30-day window with room to shrink it.
        day = clubClock.today().plusDays(7);
    }

    @Nested
    @DisplayName("opening hours")
    class Hours {

        @Test
        @DisplayName("closing a day removes it from availability entirely")
        void closingADayClosesTheClub() {
            assertThat(availabilityFor(day).clubOpen()).isTrue();

            closeOn(day.getDayOfWeek());

            DayAvailability after = availabilityFor(day);
            assertThat(after.clubOpen()).isFalse();
            assertThat(after.tables())
                    .as("a closed day must offer nothing at all")
                    .allSatisfy(table -> assertThat(table.slots())
                            .allSatisfy(slot -> assertThat(slot.available()).isFalse()));
        }

        @Test
        @DisplayName("a booking cannot be made on a day that has just been closed")
        void closingADayBlocksNewBookings() {
            closeOn(day.getDayOfWeek());

            assertThatThrownBy(() -> book(LocalTime.of(14, 0), 60))
                    .isInstanceOf(BusinessRuleException.class);
        }

        @Test
        @DisplayName("narrowing the hours withdraws the slots outside them")
        void narrowingHoursRemovesSlots() {
            // Default is 10:00–23:00. Nothing should remain before 18:00 afterwards.
            setHours(day.getDayOfWeek(), LocalTime.of(18, 0), LocalTime.of(22, 0));

            DayAvailability after = availabilityFor(day);
            assertThat(after.slotTimes())
                    .isNotEmpty()
                    .allSatisfy(time -> assertThat(time).isBetween(LocalTime.of(18, 0), LocalTime.of(22, 0)));
        }

        @Test
        @DisplayName("closing a day warns about the bookings already taken on it, but keeps them")
        void closingADayWarnsWithoutCancelling() {
            var booking = book(LocalTime.of(14, 0), 60);

            List<SettingsService.Warning> warnings = closeOn(day.getDayOfWeek());

            // The warning is the entire point: staff must not close a day with games on it
            // and only find out when the customers turn up.
            assertThat(warnings)
                    .extracting(SettingsService.Warning::reference)
                    .contains(booking.getReference());

            // And the booking still stands. Rules apply when a booking is made; a promise the
            // club has already sold is not withdrawn by a later change of policy.
            assertThat(bookingService.requireByReference(booking.getReference()).getStatus())
                    .isEqualTo(BookingStatus.CONFIRMED);
        }

        @Test
        @DisplayName("reopening a day restores its previous hours rather than blanking them")
        void reopeningRestoresHours() {
            setHours(day.getDayOfWeek(), LocalTime.of(11, 0), LocalTime.of(21, 0));
            closeOn(day.getDayOfWeek());

            // Reopen without supplying times: the stored values must still be there, or staff
            // would have to retype the week every time they close for a day.
            List<SettingsService.DayHoursInput> week = currentWeek();
            week.replaceAll(input -> input.day() == day.getDayOfWeek()
                    ? new SettingsService.DayHoursInput(
                            input.day(), false, input.openTime(), input.closeTime())
                    : input);
            settingsService.updateOpeningHours(week);

            DayAvailability after = availabilityFor(day);
            assertThat(after.clubOpen()).isTrue();
            assertThat(after.openingTime()).isEqualTo(LocalTime.of(11, 0));
            assertThat(after.closingTime()).isEqualTo(LocalTime.of(21, 0));
        }

        @Test
        @DisplayName("an open day with no times is refused")
        void refusesHalfConfiguredDay() {
            List<SettingsService.DayHoursInput> week = currentWeek();
            week.replaceAll(input -> input.day() == DayOfWeek.MONDAY
                    ? new SettingsService.DayHoursInput(input.day(), false, null, null)
                    : input);

            assertThatThrownBy(() -> settingsService.updateOpeningHours(week))
                    .isInstanceOf(BusinessRuleException.class)
                    .hasMessageContaining("opening and a closing time");
        }
    }

    @Nested
    @DisplayName("special opening hours")
    class Overrides {

        @Test
        @DisplayName("closing one date closes it without touching the same weekday elsewhere")
        void closingOneDateIsSpecificToThatDate() {
            LocalDate sameWeekdayNextWeek = day.plusWeeks(1);
            assertThat(availabilityFor(day).clubOpen()).isTrue();

            settingsService.saveOpeningHoursOverride(day, true, null, null, "Private function");

            assertThat(availabilityFor(day).clubOpen()).isFalse();
            // The whole point of a date override rather than a weekday one: next Tuesday is
            // unaffected by this Tuesday being closed.
            assertThat(availabilityFor(sameWeekdayNextWeek).clubOpen())
                    .as("the same weekday a week later")
                    .isTrue();
        }

        @Test
        @DisplayName("a date closed by an override also refuses bookings through the API")
        void closingADateBlocksNewBookings() {
            // This is the trap the OpeningHoursResolver exists to close. The grid and the
            // validator used to resolve opening hours independently, so an override taught to
            // only one of them would hide the date on the booking page while the API went on
            // accepting bookings for it — and nobody would find out until a customer arrived
            // at a locked door holding a confirmation.
            settingsService.saveOpeningHoursOverride(day, true, null, null, "Christmas Day");

            assertThat(availabilityFor(day).clubOpen()).as("hidden on the grid").isFalse();
            assertThatThrownBy(() -> book(LocalTime.of(14, 0), 60))
                    .as("and refused by the API")
                    .isInstanceOf(BusinessRuleException.class);
        }

        @Test
        @DisplayName("shortened override hours are enforced on both the grid and the API")
        void shortenedHoursAreEnforcedBothWays() {
            // The same disagreement in its subtler form: the override narrows the day rather
            // than closing it, so the grid could look right while the validator still used the
            // full weekday window for the hours the override removed.
            settingsService.saveOpeningHoursOverride(
                    day, false, LocalTime.of(18, 0), LocalTime.of(22, 0), "Boxing Day");

            DayAvailability after = availabilityFor(day);
            assertThat(after.openingTime()).isEqualTo(LocalTime.of(18, 0));
            assertThat(after.slotTimes())
                    .isNotEmpty()
                    .allSatisfy(time ->
                            assertThat(time).isBetween(LocalTime.of(18, 0), LocalTime.of(22, 0)));

            // 14:00 is inside the ordinary 10:00–23:00 weekday window and outside the override.
            assertThatThrownBy(() -> book(LocalTime.of(14, 0), 60))
                    .isInstanceOf(BusinessRuleException.class);
            // And a time the override does permit still works, so the rule narrows rather than
            // simply breaking the day.
            assertThat(book(LocalTime.of(19, 0), 60).getStatus()).isEqualTo(BookingStatus.CONFIRMED);
        }

        @Test
        @DisplayName("removing an override returns the date to its weekday hours")
        void removingAnOverrideRestoresTheWeekday() {
            settingsService.saveOpeningHoursOverride(day, true, null, null, "Cancelled event");
            assertThat(availabilityFor(day).clubOpen()).isFalse();

            settingsService.deleteOpeningHoursOverride(day);

            DayAvailability after = availabilityFor(day);
            assertThat(after.clubOpen()).isTrue();
            assertThat(after.openingTime()).isEqualTo(LocalTime.of(10, 0));
        }

        @Test
        @DisplayName("saving the same date twice replaces it rather than adding a second")
        void savingTwiceUpserts() {
            settingsService.saveOpeningHoursOverride(day, true, null, null, "First guess");
            settingsService.saveOpeningHoursOverride(
                    day, false, LocalTime.of(12, 0), LocalTime.of(18, 0), "Corrected");

            assertThat(settingsService.openingHoursOverrides())
                    .filteredOn(override -> override.getDate().equals(day))
                    .as("one row per date, never two contradicting each other")
                    .hasSize(1)
                    .first()
                    .satisfies(override -> {
                        assertThat(override.isClosed()).isFalse();
                        assertThat(override.getOpenTime()).isEqualTo(LocalTime.of(12, 0));
                    });

            assertThat(availabilityFor(day).openingTime()).isEqualTo(LocalTime.of(12, 0));
        }

        @Test
        @DisplayName("closing a date warns about the bookings already on it, but keeps them")
        void closingADateWarnsWithoutCancelling() {
            var booking = book(LocalTime.of(14, 0), 60);

            List<SettingsService.Warning> warnings =
                    settingsService.saveOpeningHoursOverride(day, true, null, null, "Staff party");

            assertThat(warnings)
                    .extracting(SettingsService.Warning::reference)
                    .contains(booking.getReference());
            assertThat(bookingService.requireByReference(booking.getReference()).getStatus())
                    .isEqualTo(BookingStatus.CONFIRMED);
        }

        @Test
        @DisplayName("a booking on another date is not reported as affected")
        void warningsAreScopedToTheDate() {
            // warningsForOverride filters by date. Without that filter every future booking in
            // the club would be listed as affected by closing one afternoon, and staff would
            // learn to ignore the warnings entirely.
            var elsewhere = book(LocalTime.of(14, 0), 60);

            List<SettingsService.Warning> warnings = settingsService.saveOpeningHoursOverride(
                    day.plusDays(1), true, null, null, "A different day");

            assertThat(warnings)
                    .extracting(SettingsService.Warning::reference)
                    .doesNotContain(elsewhere.getReference());
        }

        @Test
        @DisplayName("an open override with no times is refused")
        void refusesHalfConfiguredOverride() {
            assertThatThrownBy(() ->
                            settingsService.saveOpeningHoursOverride(day, false, null, null, null))
                    .isInstanceOf(BusinessRuleException.class)
                    .hasMessageContaining("opening and a closing time");
        }

        @Test
        @DisplayName("an override closing before it opens is refused")
        void refusesInvertedOverride() {
            assertThatThrownBy(() -> settingsService.saveOpeningHoursOverride(
                            day, false, LocalTime.of(20, 0), LocalTime.of(12, 0), null))
                    .isInstanceOf(BusinessRuleException.class)
                    .hasMessageContaining("after opening time");
        }
    }

    @Nested
    @DisplayName("booking rules")
    class Rules {

        @Test
        @DisplayName("changing the increment changes the slot grid a customer sees")
        void incrementChangesTheGrid() {
            assertThat(availabilityFor(day).incrementMinutes()).isEqualTo(30);

            settingsService.updateBookingSettings(60, 240, 60, 60, 30, 24, 15);

            DayAvailability after = availabilityFor(day);
            assertThat(after.incrementMinutes()).isEqualTo(60);
            // Every slot must now land on the hour, or the grid offers times the validator
            // will reject.
            assertThat(after.slotTimes())
                    .allSatisfy(time -> assertThat(time.getMinute()).isZero());
        }

        @Test
        @DisplayName("changing the duration range changes the options offered")
        void durationRangeChangesOptions() {
            settingsService.updateBookingSettings(60, 120, 60, 60, 30, 24, 15);

            assertThat(availabilityFor(day).durationOptions())
                    .extracting(DayAvailability.DurationOption::minutes)
                    .containsExactly(60, 120);
        }

        @Test
        @DisplayName("shortening the advance window closes days beyond it")
        void advanceWindowClosesDistantDays() {
            LocalDate distant = clubClock.today().plusDays(20);
            assertThat(availabilityFor(distant).clubOpen()).isTrue();

            settingsService.updateBookingSettings(30, 240, 30, 60, 7, 24, 15);

            // Not merely unbookable — the whole day is reported as unavailable, with every
            // slot carrying a reason rather than silently vanishing.
            assertThat(availabilityFor(distant).tables())
                    .allSatisfy(table -> assertThat(table.slots())
                            .allSatisfy(slot -> assertThat(slot.available()).isFalse()));
        }

        @Test
        @DisplayName("a duration that is not a multiple of the increment is refused")
        void refusesIndivisibleDuration() {
            // 45 is not a multiple of 30. Allowing it would put options in the grid that the
            // validator then rejects — the customer picks a slot and is told no for no
            // visible reason.
            assertThatThrownBy(() -> settingsService.updateBookingSettings(45, 240, 30, 60, 30, 24, 15))
                    .isInstanceOf(BusinessRuleException.class)
                    .hasMessageContaining("multiple of the 30-minute increment");
        }

        @Test
        @DisplayName("a maximum below the minimum is refused")
        void refusesInvertedRange() {
            assertThatThrownBy(() -> settingsService.updateBookingSettings(120, 60, 30, 60, 30, 24, 15))
                    .isInstanceOf(BusinessRuleException.class)
                    .hasMessageContaining("cannot be shorter than the minimum");
        }

        @Test
        @DisplayName("a payment hold too short to pay within is refused")
        void refusesTinyHold() {
            assertThatThrownBy(() -> settingsService.updateBookingSettings(30, 240, 30, 60, 30, 24, 1))
                    .isInstanceOf(BusinessRuleException.class);
        }

        @Test
        @DisplayName("existing bookings survive a rule change that would now forbid them")
        void existingBookingsSurvive() {
            var booking = book(LocalTime.of(14, 0), 60);

            // Raise the minimum to two hours: the existing 60-minute booking would no longer
            // be creatable.
            var warnings = settingsService.updateBookingSettings(120, 240, 60, 60, 30, 24, 15);

            assertThat(warnings)
                    .extracting(SettingsService.Warning::reference)
                    .contains(booking.getReference());
            assertThat(bookingService.requireByReference(booking.getReference()).getStatus())
                    .isEqualTo(BookingStatus.CONFIRMED);
        }
    }

    @Nested
    @DisplayName("pricing")
    class Pricing {

        @Test
        @DisplayName("changing the rate changes what the next customer is quoted")
        void rateChangeChangesQuote() {
            assertThat(quoteFor(60)).isEqualTo(1200);

            PricingRule standard = settingsService.pricingRules().getFirst();
            settingsService.savePricingRule(
                    standard.getId(), "Standard hourly rate", null, null, null, null, 1500, 0, true);

            assertThat(quoteFor(60)).isEqualTo(1500);
            // Pro rata, rounded up in the club's favour.
            assertThat(quoteFor(90)).isEqualTo(2250);
        }

        @Test
        @DisplayName("a booking keeps the price it was quoted when the rate later changes")
        void existingBookingKeepsItsPrice() {
            var booking = book(LocalTime.of(14, 0), 60);
            assertThat(booking.getPricePence()).isEqualTo(1200);

            PricingRule standard = settingsService.pricingRules().getFirst();
            settingsService.savePricingRule(
                    standard.getId(), "Standard hourly rate", null, null, null, null, 5000, 0, true);

            // The amount is stored on the booking row, not recomputed on read. A customer who
            // booked at £12 does not owe £50 because the club put its prices up afterwards.
            assertThat(bookingService.requireByReference(booking.getReference()).getPricePence())
                    .isEqualTo(1200);
        }

        @Test
        @DisplayName("a higher-priority rule wins for the times it covers")
        void priorityRuleOverrides() {
            settingsService.savePricingRule(
                    null, "Evening peak", null, null, LocalTime.of(18, 0), LocalTime.of(23, 0),
                    2000, 10, true);

            assertThat(quoteAt(LocalTime.of(14, 0), 60)).isEqualTo(1200);
            assertThat(quoteAt(LocalTime.of(19, 0), 60)).isEqualTo(2000);
        }

        @Test
        @DisplayName("the grid shows the rate that applies at each time, not one rate per row")
        void theGridShowsTheRateAtEachSlot() {
            // The gap this closes: the assertions above prove the *quote* is right, and the
            // quote was always right. The grid's displayed rate was computed once at opening
            // time and shown against every slot in the row, so a rule narrowed to the evening
            // never appeared and a morning rule was shown all day. Staff configured a peak
            // rate, saw no change on the booking page, and reasonably concluded pricing rules
            // did not work.
            settingsService.savePricingRule(
                    null, "Evening peak", null, null, LocalTime.of(18, 0), LocalTime.of(23, 0),
                    2000, 10, true);

            var row = availabilityFor(day).tables().stream()
                    .filter(table -> table.tableId() == tableId)
                    .findFirst()
                    .orElseThrow();

            assertThat(rateAt(row, LocalTime.of(14, 0)))
                    .as("before the peak window")
                    .isEqualTo(1200);
            assertThat(rateAt(row, LocalTime.of(19, 0)))
                    .as("inside the peak window")
                    .isEqualTo(2000);

            // The row headline is a "from" price and says so, rather than quoting one figure
            // for a day that has two.
            assertThat(row.hourlyRatePence()).as("cheapest in the row").isEqualTo(1200);
            assertThat(row.highestHourlyRatePence()).as("dearest in the row").isEqualTo(2000);
            assertThat(row.varyingRate()).isTrue();
        }

        @Test
        @DisplayName("a booking spanning a rate change pays each rate for the time it covers")
        void aBookingSpanningARateChangeIsSplit() {
            // A 10:00–14:00 morning rate and a booking of 10:30–14:30 straddles the boundary.
            // Charging the start rate for the whole booking sold the last half hour at the
            // morning price; charging the end rate would overcharge the first three and a
            // half. Neither matches what the customer was shown on the grid.
            settingsService.savePricingRule(
                    null, "Morning rate", null, null, LocalTime.of(10, 0), LocalTime.of(14, 0),
                    750, 10, true);

            // 3h30 at 750 = 2625p, plus 30 min at the 1200 fallback = 600p.
            assertThat(quoteAt(LocalTime.of(10, 30), 240)).isEqualTo(2625 + 600);

            // Wholly inside the window, and wholly outside it, are unchanged.
            assertThat(quoteAt(LocalTime.of(10, 30), 60)).as("inside the morning").isEqualTo(750);
            assertThat(quoteAt(LocalTime.of(15, 0), 60)).as("after it").isEqualTo(1200);

            // And the boundary itself belongs to the later rate: the rule is [10:00, 14:00).
            assertThat(quoteAt(LocalTime.of(14, 0), 60)).as("starting at the boundary").isEqualTo(1200);
        }

        @Test
        @DisplayName("a booking crossing two rate changes pays all three rates")
        void aBookingCrossingTwoBoundaries() {
            // Guards the loop rather than a single split: a quote that stopped at the first
            // boundary would price the rest of the booking at the middle rate.
            settingsService.savePricingRule(
                    null, "Morning", null, null, LocalTime.of(10, 0), LocalTime.of(12, 0),
                    600, 10, true);
            settingsService.savePricingRule(
                    null, "Evening", null, null, LocalTime.of(14, 0), LocalTime.of(23, 0),
                    1800, 10, true);

            // 11:00–15:00: 1h at 600, 2h at the 1200 fallback, 1h at 1800.
            assertThat(quoteAt(LocalTime.of(11, 0), 240)).isEqualTo(600 + 2400 + 1800);
        }

        @Test
        @DisplayName("a row with one rate all day is not reported as varying")
        void aUniformRowDoesNotClaimToVary() {
            // Otherwise every row would render as a range, and "£12.00–£12.00/hr" is worse
            // than the single figure it replaced.
            var row = availabilityFor(day).tables().stream()
                    .filter(table -> table.tableId() == tableId)
                    .findFirst()
                    .orElseThrow();

            assertThat(row.varyingRate()).isFalse();
            assertThat(row.hourlyRatePence()).isEqualTo(1200);
            assertThat(row.highestHourlyRatePence()).isEqualTo(1200);
        }

        @Test
        @DisplayName("the last catch-all rule cannot be deactivated")
        void refusesToRemoveTheLastCatchAll() {
            PricingRule standard = settingsService.pricingRules().getFirst();

            // Without a rule matching everything, PricingService throws and every booking
            // attempt becomes a 500 — the club silently stops selling. Refuse at the point of
            // the change rather than at the first customer of the day.
            assertThatThrownBy(() -> settingsService.savePricingRule(
                            standard.getId(), standard.getName(), null, null, null, null,
                            standard.getHourlyRatePence(), 0, false))
                    .isInstanceOf(BusinessRuleException.class)
                    .hasMessageContaining("every table at every time");

            // And the club can still price a booking.
            assertThat(quoteFor(60)).isEqualTo(1200);
        }

        @Test
        @DisplayName("deleting the last catch-all rule is refused too")
        void refusesToDeleteTheLastCatchAll() {
            PricingRule standard = settingsService.pricingRules().getFirst();

            assertThatThrownBy(() -> settingsService.deletePricingRule(standard.getId()))
                    .isInstanceOf(BusinessRuleException.class);

            assertThat(quoteFor(60)).isEqualTo(1200);
        }
    }

    // ---------------------------------------------------------------- helpers

    private DayAvailability availabilityFor(LocalDate date) {
        return availabilityService.availability(date, null, null);
    }

    private int quoteFor(int minutes) {
        return quoteAt(LocalTime.of(14, 0), minutes);
    }

    /** The rate the grid reports for one cell of a row. */
    private int rateAt(
            uk.co.club.booking.domain.availability.TableAvailability row, LocalTime time) {
        return row.slots().stream()
                .filter(slot -> slot.startTime().equals(time))
                .findFirst()
                .orElseThrow(() -> new AssertionError("No slot at " + time))
                .hourlyRatePence();
    }

    private int quoteAt(LocalTime time, int minutes) {
        return bookingService.quotePence(tableId, clubClock.toInstant(day, time), minutes);
    }

    private uk.co.club.booking.domain.booking.Booking book(LocalTime time, int minutes) {
        return bookingService.create(
                new CreateBookingCommand(
                        tableId,
                        clubClock.toInstant(day, time),
                        minutes,
                        null,
                        "Test Customer",
                        "settings@example.test",
                        null,
                        null,
                        BookingSource.ADMIN,
                        adminId),
                BookingPolicy.staff());
    }

    /** The stored week, as service inputs, so a test can change one day and resubmit. */
    private List<SettingsService.DayHoursInput> currentWeek() {
        List<SettingsService.DayHoursInput> week = new ArrayList<>();
        for (OpeningHours hours : settingsService.openingHours()) {
            week.add(new SettingsService.DayHoursInput(
                    hours.getDay(), hours.isClosed(), hours.getOpenTime(), hours.getCloseTime()));
        }
        return week;
    }

    private List<SettingsService.Warning> closeOn(DayOfWeek dayOfWeek) {
        List<SettingsService.DayHoursInput> week = currentWeek();
        week.replaceAll(input -> input.day() == dayOfWeek
                ? new SettingsService.DayHoursInput(
                        input.day(), true, input.openTime(), input.closeTime())
                : input);
        return settingsService.updateOpeningHours(week);
    }

    private void setHours(DayOfWeek dayOfWeek, LocalTime open, LocalTime close) {
        List<SettingsService.DayHoursInput> week = currentWeek();
        week.replaceAll(input -> input.day() == dayOfWeek
                ? new SettingsService.DayHoursInput(input.day(), false, open, close)
                : input);
        settingsService.updateOpeningHours(week);
    }
}

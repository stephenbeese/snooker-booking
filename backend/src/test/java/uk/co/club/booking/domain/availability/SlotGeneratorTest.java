package uk.co.club.booking.domain.availability;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import uk.co.club.booking.common.time.ClubClock;
import uk.co.club.booking.domain.club.BookingSettings;
import uk.co.club.booking.domain.club.OpeningHours;
import uk.co.club.booking.support.TestFixtures;

class SlotGeneratorTest {

    private final ClubClock clubClock =
            new ClubClock(Clock.fixed(Instant.parse("2026-08-01T09:00:00Z"), ZoneOffset.UTC),
                    "Europe/London");
    private final SlotGenerator generator = new SlotGenerator(clubClock);

    private final BookingSettings settings = TestFixtures.bookingSettings();

    @Test
    void generatesHalfHourSlotsAcrossAnOrdinaryDay() {
        OpeningHours hours = TestFixtures.openingHours(LocalTime.of(10, 0), LocalTime.of(23, 0));

        OpeningWindow window = generator.openingWindow(LocalDate.of(2026, 8, 20), hours).orElseThrow();
        List<Instant> starts = generator.slotStarts(window, settings);

        // 10:00-23:00 is 13 hours; at 30-minute increments that is 26 slot starts.
        assertThat(starts).hasSize(26);
        assertThat(clubClock.toLocalTime(starts.getFirst())).isEqualTo(LocalTime.of(10, 0));
        assertThat(clubClock.toLocalTime(starts.getLast())).isEqualTo(LocalTime.of(22, 30));
        // Every start must fall strictly before closing.
        assertThat(starts).allSatisfy(start -> assertThat(start).isBefore(window.closeAt()));
    }

    @Test
    void closedDayHasNoWindow() {
        OpeningHours closed = TestFixtures.closedDay();

        assertThat(generator.openingWindow(LocalDate.of(2026, 8, 20), closed)).isEmpty();
    }

    @Test
    void springForwardDayLosesAnHourOfSlots() {
        // 2026-03-29: clocks go forward 01:00 -> 02:00, so the local day is 23 hours.
        // A 00:00-23:00 window is therefore 22 real hours, not 23.
        OpeningHours hours = TestFixtures.openingHours(LocalTime.of(0, 0), LocalTime.of(23, 0));

        OpeningWindow window = generator.openingWindow(LocalDate.of(2026, 3, 29), hours).orElseThrow();
        List<Instant> starts = generator.slotStarts(window, settings);

        assertThat(Duration.between(window.openAt(), window.closeAt())).isEqualTo(Duration.ofHours(22));
        assertThat(starts).hasSize(44);
    }

    @Test
    void autumnBackDayGainsAnHourOfSlots() {
        // 2026-10-25: clocks go back 02:00 -> 01:00, so the local day is 25 hours.
        // A 00:00-23:00 window is 24 real hours. Stepping LocalTime would give 23 and
        // silently drop an hour of bookable time.
        OpeningHours hours = TestFixtures.openingHours(LocalTime.of(0, 0), LocalTime.of(23, 0));

        OpeningWindow window = generator.openingWindow(LocalDate.of(2026, 10, 25), hours).orElseThrow();
        List<Instant> starts = generator.slotStarts(window, settings);

        assertThat(Duration.between(window.openAt(), window.closeAt())).isEqualTo(Duration.ofHours(24));
        assertThat(starts).hasSize(48);
    }

    @Test
    void normalTradingHoursAreUnaffectedByTheAutumnTransition() {
        // The club opens at 10:00, well after the 01:00-02:00 overlap, so a transition
        // day should still produce an ordinary 13-hour trading window.
        OpeningHours hours = TestFixtures.openingHours(LocalTime.of(10, 0), LocalTime.of(23, 0));

        OpeningWindow window = generator.openingWindow(LocalDate.of(2026, 10, 25), hours).orElseThrow();

        assertThat(Duration.between(window.openAt(), window.closeAt())).isEqualTo(Duration.ofHours(13));
        assertThat(generator.slotStarts(window, settings)).hasSize(26);
    }

    @Test
    void windowThatCollapsesAcrossTheSpringGapIsTreatedAsClosed() {
        // 01:00-02:00 on the spring-forward date: both resolve to the same instant, so
        // there is no bookable window. It must not produce a zero or negative one.
        OpeningHours hours = TestFixtures.openingHours(LocalTime.of(1, 0), LocalTime.of(2, 0));

        Optional<OpeningWindow> window = generator.openingWindow(LocalDate.of(2026, 3, 29), hours);

        assertThat(window).isEmpty();
    }

    @Test
    void respectsAConfiguredFifteenMinuteIncrement() {
        OpeningHours hours = TestFixtures.openingHours(LocalTime.of(10, 0), LocalTime.of(12, 0));
        BookingSettings quarterHourly = TestFixtures.bookingSettings(builder -> {
            builder.setIncrementMinutes(15);
            builder.setMinDurationMinutes(30);
            builder.setMaxDurationMinutes(120);
        });

        OpeningWindow window = generator.openingWindow(LocalDate.of(2026, 8, 20), hours).orElseThrow();

        assertThat(generator.slotStarts(window, quarterHourly)).hasSize(8);
    }
}

package uk.co.club.booking.common.time;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

/**
 * These cases are the reason ClubClock exists. The club runs on Europe/London, so the
 * UTC offset changes twice a year and a naive conversion is silently an hour out for
 * half of it.
 */
class ClubClockTest {

    private static final String LONDON = "Europe/London";

    private ClubClock clockAt(String instant) {
        return new ClubClock(Clock.fixed(Instant.parse(instant), ZoneOffset.UTC), LONDON);
    }

    @Test
    void convertsWinterWallClockAtZeroOffset() {
        ClubClock clock = clockAt("2026-01-15T12:00:00Z");

        Instant tenAm = clock.toInstant(LocalDate.of(2026, 1, 15), LocalTime.of(10, 0));

        // GMT: 10:00 local is 10:00 UTC.
        assertThat(tenAm).isEqualTo(Instant.parse("2026-01-15T10:00:00Z"));
    }

    @Test
    void convertsSummerWallClockAtOneHourOffset() {
        ClubClock clock = clockAt("2026-08-20T12:00:00Z");

        Instant tenAm = clock.toInstant(LocalDate.of(2026, 8, 20), LocalTime.of(10, 0));

        // BST: 10:00 local is 09:00 UTC. Getting this wrong shifts every summer booking.
        assertThat(tenAm).isEqualTo(Instant.parse("2026-08-20T09:00:00Z"));
    }

    @Test
    void todayUsesClubZoneNotServerZone() {
        // 23:30 UTC on 20 Aug is already 00:30 on 21 Aug in London.
        ClubClock clock = clockAt("2026-08-20T23:30:00Z");

        assertThat(clock.today()).isEqualTo(LocalDate.of(2026, 8, 21));
    }

    @Test
    void springForwardGapShiftsForwardRatherThanFailing() {
        ClubClock clock = clockAt("2026-03-29T00:00:00Z");

        // 01:30 does not exist on 2026-03-29 in London: the clocks jump 01:00 -> 02:00.
        Instant resolved = clock.toInstant(LocalDate.of(2026, 3, 29), LocalTime.of(1, 30));

        assertThat(resolved).isEqualTo(Instant.parse("2026-03-29T01:30:00Z"));
        assertThat(clock.toLocalTime(resolved)).isEqualTo(LocalTime.of(2, 30));
    }

    @Test
    void autumnOverlapResolvesToTheEarlierOffset() {
        ClubClock clock = clockAt("2026-10-25T00:00:00Z");

        // 01:30 happens twice on 2026-10-25. The earlier (BST) instant wins.
        Instant resolved = clock.toInstant(LocalDate.of(2026, 10, 25), LocalTime.of(1, 30));

        assertThat(resolved).isEqualTo(Instant.parse("2026-10-25T00:30:00Z"));
    }

    @Test
    void roundTripsAnInstantBackToClubLocalValues() {
        ClubClock clock = clockAt("2026-08-20T12:00:00Z");
        Instant instant = Instant.parse("2026-08-20T18:30:00Z");

        assertThat(clock.toLocalDate(instant)).isEqualTo(LocalDate.of(2026, 8, 20));
        assertThat(clock.toLocalTime(instant)).isEqualTo(LocalTime.of(19, 30));
    }
}

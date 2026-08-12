package uk.co.club.booking.domain.club.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import uk.co.club.booking.domain.club.web.dto.ClubResponse;
import uk.co.club.booking.support.AbstractIntegrationTest;

/**
 * The public club profile, against the real migrated database.
 *
 * <p>Run as an integration test rather than with mocked repositories because everything worth
 * asserting here is about the seeded reference data — that all seven weekdays exist, that
 * Sunday genuinely differs, and that the advertised rate comes from the same pricing rules the
 * booking engine charges from. Mocks would assert only that the mapping code compiles.
 */
class ClubControllerIT extends AbstractIntegrationTest {

    @Autowired private ClubController controller;

    @Test
    @DisplayName("returns the configured club identity and contact details")
    void returnsClubProfile() {
        ClubResponse club = controller.club();

        assertThat(club.name()).isEqualTo("The Snooker Club");
        assertThat(club.description()).isNotBlank();
        assertThat(club.contact().city()).isEqualTo("Manchester");
        assertThat(club.contact().postcode()).isEqualTo("M1 1AA");
    }

    @Test
    @DisplayName("returns all seven weekdays in Monday-first order")
    void returnsSevenDaysInOrder() {
        ClubResponse club = controller.club();

        assertThat(club.openingHours()).hasSize(7);
        assertThat(club.openingHours())
                .extracting(ClubResponse.DayHours::dayOfWeek)
                .containsExactly(1, 2, 3, 4, 5, 6, 7);
    }

    @Test
    @DisplayName("reports Sunday's shorter day, not a blanket weekday assumption")
    void reportsSundayHours() {
        ClubResponse club = controller.club();

        ClubResponse.DayHours sunday = club.openingHours().get(6);
        assertThat(sunday.dayOfWeek()).isEqualTo(7);
        assertThat(sunday.closed()).isFalse();
        assertThat(sunday.openTime()).isEqualTo(LocalTime.of(12, 0));
        assertThat(sunday.closeTime()).isEqualTo(LocalTime.of(20, 0));
    }

    @Test
    @DisplayName("nulls the times on a closed day rather than exposing stale values")
    void closedDayHasNoTimes() {
        // The columns keep their previous values when a day is closed, so a passthrough
        // mapping would render "Wednesday: closed, 10:00-23:00".
        jdbcTemplate.update("UPDATE opening_hours SET closed = TRUE WHERE day_of_week = 3");

        ClubResponse.DayHours wednesday = controller.club().openingHours().get(2);

        assertThat(wednesday.closed()).isTrue();
        assertThat(wednesday.openTime()).isNull();
        assertThat(wednesday.closeTime()).isNull();
    }

    @Test
    @DisplayName("advertises the cheapest active rate, so the headline cannot undercut itself")
    void advertisesCheapestRate() {
        // A cheaper off-peak rule must move the "from" price down, or the site advertises
        // more than the customer would actually pay.
        jdbcTemplate.update(
                """
                INSERT INTO pricing_rule (name, hourly_rate_pence, priority, active)
                VALUES ('Off-peak', 800, 10, TRUE)
                """);

        assertThat(controller.club().fromHourlyRatePence()).isEqualTo(800);
    }

    @Test
    @DisplayName("passes through the booking limits the home page quotes")
    void returnsBookingLimits() {
        ClubResponse club = controller.club();

        assertThat(club.minDurationMinutes()).isEqualTo(30);
        assertThat(club.maxAdvanceDays()).isEqualTo(30);
    }
}

package uk.co.club.booking.domain.club;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import uk.co.club.booking.common.time.ClubClock;
import uk.co.club.booking.domain.table.SnookerTable;
import uk.co.club.booking.support.TestFixtures;

@ExtendWith(MockitoExtension.class)
class PricingServiceTest {

    private static final Instant NOW = Instant.parse("2026-08-20T08:00:00Z");

    @Mock private PricingRuleRepository pricingRuleRepository;

    private ClubClock clubClock;
    private PricingService service;
    private SnookerTable table;

    @BeforeEach
    void setUp() {
        clubClock = new ClubClock(Clock.fixed(NOW, ZoneOffset.UTC), "Europe/London");
        service = new PricingService(pricingRuleRepository, clubClock);
        table = TestFixtures.table(1L, "Table 1");
    }

    private void givenHourlyRate(int pence) {
        when(pricingRuleRepository.findAllByActiveTrueOrderByPriorityDesc())
                .thenReturn(List.of(TestFixtures.pricingRule("Standard", pence, 0)));
    }

    private Instant at(int hour, int minute) {
        return clubClock.toInstant(LocalDate.of(2026, 8, 20), LocalTime.of(hour, minute));
    }

    @ParameterizedTest(name = "{0} minutes at 1200p/hour costs {1}p")
    @CsvSource({
        "30, 600",
        "60, 1200",
        "90, 1800",
        "120, 2400",
        "240, 4800"
    })
    void chargesProRataFromTheHourlyRate(int minutes, int expectedPence) {
        givenHourlyRate(1200);

        int price = service.quotePence(table, at(14, 0), at(14, 0).plus(Duration.ofMinutes(minutes)));

        assertThat(price).isEqualTo(expectedPence);
    }

    @Test
    void handlesRatesThatDoNotDivideEvenlyByRoundingUp() {
        // £12.50/hour for 90 minutes is exactly 1875p.
        givenHourlyRate(1250);
        assertThat(service.quotePence(table, at(14, 0), at(15, 30))).isEqualTo(1875);

        // £10.01/hour for 30 minutes is 500.5p, which must round up rather than lose
        // half a penny on every booking.
        givenHourlyRate(1001);
        assertThat(service.quotePence(table, at(14, 0), at(14, 30))).isEqualTo(501);
    }

    @Test
    void usesTheHighestPriorityMatchingRule() {
        // A weekend/peak rule would outrank the catch-all. Ordering comes from the
        // repository query; the service takes the first match.
        when(pricingRuleRepository.findAllByActiveTrueOrderByPriorityDesc())
                .thenReturn(List.of(
                        TestFixtures.pricingRule("Evening peak", 1500, 10, LocalTime.of(17, 0), null),
                        TestFixtures.pricingRule("Standard", 1200, 0)));

        // 18:00 falls inside the peak window.
        assertThat(service.hourlyRatePence(table, at(18, 0))).isEqualTo(1500);
        // 14:00 does not, so it falls through to the catch-all.
        assertThat(service.hourlyRatePence(table, at(14, 0))).isEqualTo(1200);
    }

    @Test
    void rejectsANonPositiveInterval() {
        // No rate stub needed: the interval is validated before any pricing lookup, and
        // Mockito's strict stubbing proves that ordering.
        assertThatThrownBy(() -> service.quotePence(table, at(14, 0), at(14, 0)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void failsLoudlyWhenNoRuleMatches() {
        when(pricingRuleRepository.findAllByActiveTrueOrderByPriorityDesc()).thenReturn(List.of());

        // Silently defaulting to zero would give away free table time.
        assertThatThrownBy(() -> service.hourlyRatePence(table, at(14, 0)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("No active pricing rule");
    }
}

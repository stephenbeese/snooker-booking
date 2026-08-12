package uk.co.club.booking.domain.club;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uk.co.club.booking.common.time.ClubClock;
import uk.co.club.booking.domain.table.SnookerTable;

/**
 * Authoritative price calculation. The frontend displays prices but never supplies
 * them; a price arriving in a request body is ignored.
 *
 * <p>All arithmetic is in integer pence — no floating point anywhere near money.
 */
@Service
public class PricingService {

    private final PricingRuleRepository pricingRuleRepository;
    private final ClubClock clubClock;

    public PricingService(PricingRuleRepository pricingRuleRepository, ClubClock clubClock) {
        this.pricingRuleRepository = pricingRuleRepository;
        this.clubClock = clubClock;
    }

    /**
     * Price for occupying a table over an interval.
     *
     * <p>Charged pro rata from the hourly rate and rounded up to the nearest penny, so
     * the club never loses a fraction: 90 minutes at £12.50/hour is 1875p exactly, and
     * an odd rate that would land on a half-penny rounds in the club's favour.
     */
    @Transactional(readOnly = true)
    public int quotePence(SnookerTable table, Instant startAt, Instant endAt) {
        long minutes = Duration.between(startAt, endAt).toMinutes();
        if (minutes <= 0) {
            throw new IllegalArgumentException("Booking interval must be positive");
        }
        int hourlyRatePence = hourlyRatePence(table, startAt);
        return Math.toIntExact(Math.ceilDiv(hourlyRatePence * minutes, 60L));
    }

    /** The hourly rate applying to this table at this instant. */
    @Transactional(readOnly = true)
    public int hourlyRatePence(SnookerTable table, Instant startAt) {
        List<PricingRule> rules = pricingRuleRepository.findAllByActiveTrueOrderByPriorityDesc();
        var localDate = clubClock.toLocalDate(startAt);
        var localTime = clubClock.toLocalTime(startAt);

        return rules.stream()
                .filter(rule -> rule.matches(table.getTableType(), localDate.getDayOfWeek(), localTime))
                .findFirst()
                .map(PricingRule::getHourlyRatePence)
                .orElseThrow(() -> new IllegalStateException(
                        "No active pricing rule matches table " + table.getName()
                                + " at " + startAt + "; migration V6 seeds a catch-all rule"));
    }
}

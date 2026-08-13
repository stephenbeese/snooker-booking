package uk.co.club.booking.domain.club;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalTime;
import java.time.LocalDate;
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

        // Charged per minute at the rate in force for that minute, not at the rate at the
        // start. A booking of 10:30–14:30 under a 10:00–14:00 morning rate spans both rates:
        // taking the start rate for the whole booking sold the last half hour at the morning
        // price, and taking the end rate would overcharge the first three and a half hours.
        // Either way the club and the customer disagree about what was bought.
        List<PricingRule> rules = pricingRuleRepository.findAllByActiveTrueOrderByPriorityDesc();

        long totalPenceMinutes = 0;
        Instant cursor = startAt;
        while (cursor.isBefore(endAt)) {
            Instant next = nextRateChange(rules, table, cursor, endAt);
            long segmentMinutes = Duration.between(cursor, next).toMinutes();
            totalPenceMinutes += (long) rateFrom(rules, table, cursor) * segmentMinutes;
            cursor = next;
        }

        // Rounded up once at the end, not per segment: rounding each piece would charge up to
        // a penny extra for every rate change, so a booking's price would depend on how many
        // boundaries it happened to cross.
        return Math.toIntExact(Math.ceilDiv(totalPenceMinutes, 60L));
    }

    /**
     * The next instant at or before {@code limit} where this table's rate changes.
     *
     * <p>Stepping a minute at a time would be simpler and 240 lookups for a four-hour booking.
     * Rates only change at a rule's start or end time, so those are the only instants worth
     * testing — and the rate is then constant across each segment between them.
     */
    private Instant nextRateChange(
            List<PricingRule> rules, SnookerTable table, Instant from, Instant limit) {
        int currentRate = rateFrom(rules, table, from);
        Instant earliest = limit;

        for (PricingRule rule : rules) {
            for (LocalTime boundary : rule.boundaryTimes()) {
                // A rule's boundary recurs daily, so test it on the day of `from` and the
                // next — a booking running past midnight would otherwise miss the change.
                LocalDate day = clubClock.toLocalDate(from);
                for (LocalDate candidateDay : List.of(day, day.plusDays(1))) {
                    Instant candidate = clubClock.toInstant(candidateDay, boundary);
                    if (candidate.isAfter(from)
                            && candidate.isBefore(earliest)
                            && rateFrom(rules, table, candidate) != currentRate) {
                        earliest = candidate;
                    }
                }
            }
        }
        return earliest;
    }

    /** The hourly rate applying to this table at this instant. */
    @Transactional(readOnly = true)
    public int hourlyRatePence(SnookerTable table, Instant startAt) {
        return rateFrom(pricingRuleRepository.findAllByActiveTrueOrderByPriorityDesc(), table, startAt);
    }

    /**
     * The rate at each of several instants, reading the rules once.
     *
     * <p>The availability grid needs a rate per cell — a rule narrowed to the morning makes
     * the rate a function of the slot, not of the table. Calling {@link #hourlyRatePence} in a
     * loop would issue one query per cell: six tables of thirty slots is 180 queries to render
     * one day.
     */
    @Transactional(readOnly = true)
    public int[] hourlyRatesPence(SnookerTable table, List<Instant> startAts) {
        List<PricingRule> rules = pricingRuleRepository.findAllByActiveTrueOrderByPriorityDesc();
        int[] rates = new int[startAts.size()];
        for (int i = 0; i < startAts.size(); i++) {
            rates[i] = rateFrom(rules, table, startAts.get(i));
        }
        return rates;
    }

    private int rateFrom(List<PricingRule> rules, SnookerTable table, Instant startAt) {
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

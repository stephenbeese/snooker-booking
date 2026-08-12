package uk.co.club.booking.domain.club.web;

import java.util.List;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import uk.co.club.booking.domain.club.BookingSettings;
import uk.co.club.booking.domain.club.BookingSettingsRepository;
import uk.co.club.booking.domain.club.ClubSettings;
import uk.co.club.booking.domain.club.ClubSettingsRepository;
import uk.co.club.booking.domain.club.OpeningHours;
import uk.co.club.booking.domain.club.OpeningHoursRepository;
import uk.co.club.booking.domain.club.PricingRule;
import uk.co.club.booking.domain.club.PricingRuleRepository;
import uk.co.club.booking.domain.club.web.dto.ClubResponse;

/**
 * Public club profile. Unauthenticated, like availability: a prospective customer must be
 * able to read the address and opening hours before deciding to create an account.
 *
 * <p>Read-only. Editing these settings is admin work and lives elsewhere.
 */
@RestController
public class ClubController {

    private final ClubSettingsRepository clubSettingsRepository;
    private final OpeningHoursRepository openingHoursRepository;
    private final BookingSettingsRepository bookingSettingsRepository;
    private final PricingRuleRepository pricingRuleRepository;

    public ClubController(
            ClubSettingsRepository clubSettingsRepository,
            OpeningHoursRepository openingHoursRepository,
            BookingSettingsRepository bookingSettingsRepository,
            PricingRuleRepository pricingRuleRepository) {
        this.clubSettingsRepository = clubSettingsRepository;
        this.openingHoursRepository = openingHoursRepository;
        this.bookingSettingsRepository = bookingSettingsRepository;
        this.pricingRuleRepository = pricingRuleRepository;
    }

    @GetMapping("/api/club")
    @Transactional(readOnly = true)
    public ClubResponse club() {
        ClubSettings club = clubSettingsRepository.current();
        BookingSettings settings =
                BookingSettings.require(bookingSettingsRepository.findSingleton());

        List<ClubResponse.DayHours> hours =
                openingHoursRepository.findAllByOrderByDayOfWeekAsc().stream()
                        .map(ClubController::toDayHours)
                        .toList();

        return new ClubResponse(
                club.getName(),
                club.getDescription(),
                new ClubResponse.ContactDetails(
                        club.getAddressLine1(),
                        club.getAddressLine2(),
                        club.getCity(),
                        club.getPostcode(),
                        club.getPhone(),
                        club.getEmail(),
                        club.getWebsite()),
                hours,
                fromHourlyRatePence(),
                settings.getMinDurationMinutes(),
                settings.getMaxAdvanceDays());
    }

    private static ClubResponse.DayHours toDayHours(OpeningHours day) {
        // Times are nulled on a closed day rather than passed through. The column may hold
        // stale values from before the day was closed, and rendering "Sunday closed
        // 12:00-20:00" is worse than rendering nothing.
        boolean closed = day.isClosed();
        return new ClubResponse.DayHours(
                day.getDay().getValue(),
                closed,
                closed ? null : day.getOpenTime(),
                closed ? null : day.getCloseTime());
    }

    /**
     * Cheapest active hourly rate, for a "from £x per hour" headline.
     *
     * <p>Computed from the same rules the booking engine prices with, so the advertised
     * figure cannot drift from what a customer is actually charged. Reuses the existing
     * ordered-by-priority query and re-sorts in memory: the rule table holds a handful of
     * rows, so a dedicated MIN() query would buy nothing.
     */
    private int fromHourlyRatePence() {
        return pricingRuleRepository.findAllByActiveTrueOrderByPriorityDesc().stream()
                .mapToInt(PricingRule::getHourlyRatePence)
                .min()
                .orElseThrow(() -> new IllegalStateException(
                        "No active pricing rule; migration V6 seeds a catch-all rule"));
    }
}

package uk.co.club.booking.domain.club;

import java.time.LocalDate;
import java.util.Optional;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import uk.co.club.booking.domain.availability.OpeningWindow;
import uk.co.club.booking.domain.availability.SlotGenerator;

/**
 * The one place a date becomes an opening window.
 *
 * <h2>Why this class exists</h2>
 *
 * Two callers need this answer: {@code AvailabilityService}, which decides what the grid
 * offers, and {@code BookingValidator}, which decides what the API accepts. They used to
 * resolve it independently with an identical three-line idiom.
 *
 * <p>That duplication was harmless only while the answer was "look up the weekday". The moment
 * overrides exist, teaching one caller about them and not the other produces the worst possible
 * failure: the grid shows Christmas Day as closed while the API still accepts bookings for it.
 * Nobody sees the disagreement until a customer is standing at a locked door with a confirmed
 * booking.
 *
 * <p>So both callers now ask this class, and overrides are added here once. A future rule —
 * seasonal hours, a members' evening — has exactly one place to go, and cannot be half-applied.
 *
 * <h2>Precedence</h2>
 *
 * An override for the date wins outright over that date's weekday hours; there is no merging.
 * A closed override, or one whose times do not resolve to a positive window, means closed —
 * the weekday hours are <em>not</em> consulted as a fallback, because "closed on Christmas Day"
 * must not silently revert to Thursday's hours.
 */
@Component
public class OpeningHoursResolver {

    private final OpeningHoursRepository openingHoursRepository;
    private final OpeningHoursOverrideRepository overrideRepository;
    private final SlotGenerator slotGenerator;

    public OpeningHoursResolver(
            OpeningHoursRepository openingHoursRepository,
            OpeningHoursOverrideRepository overrideRepository,
            SlotGenerator slotGenerator) {
        this.openingHoursRepository = openingHoursRepository;
        this.overrideRepository = overrideRepository;
        this.slotGenerator = slotGenerator;
    }

    /**
     * The window the club is open on a date, or empty when it is closed.
     *
     * <p>Routed through {@link SlotGenerator#openingWindow} in both branches so an override
     * inherits the DST spring-forward guard rather than reimplementing it — hours that collapse
     * onto the same instant are refused identically however they were configured.
     */
    @Transactional(readOnly = true)
    public Optional<OpeningWindow> windowFor(LocalDate date) {
        Optional<OpeningHoursOverride> override = overrideRepository.findById(date);
        if (override.isPresent()) {
            return slotGenerator.openingWindow(date, override.get());
        }
        return openingHoursRepository
                .findByDayValue(OpeningHoursRepository.dayValue(date.getDayOfWeek()))
                .flatMap(hours -> slotGenerator.openingWindow(date, hours));
    }

    /**
     * The override in force on a date, if any.
     *
     * <p>Separate from {@link #windowFor} because the window alone cannot explain itself: a day
     * with no slots looks broken unless the grid can say "Christmas Day".
     */
    @Transactional(readOnly = true)
    public Optional<OpeningHoursOverride> overrideFor(LocalDate date) {
        return overrideRepository.findById(date);
    }
}

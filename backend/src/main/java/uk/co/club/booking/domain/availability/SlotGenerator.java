package uk.co.club.booking.domain.availability;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import uk.co.club.booking.common.time.ClubClock;
import uk.co.club.booking.domain.club.BookingSettings;
import uk.co.club.booking.domain.club.OpeningHours;
import uk.co.club.booking.domain.club.OpeningHoursOverride;

/**
 * Turns opening hours plus the configured increment into the grid's time axis.
 *
 * <p>Slots are produced by stepping <em>instants</em>, never local times. On the
 * October transition a London day has 25 hours; stepping local times would silently
 * emit 24 hours of slots and lose an hour of bookable time. On the March transition the
 * day has 23 hours and stepping local times would emit an hour that does not exist.
 */
@Component
public class SlotGenerator {

    private static final Logger log = LoggerFactory.getLogger(SlotGenerator.class);

    private final ClubClock clubClock;

    public SlotGenerator(ClubClock clubClock) {
        this.clubClock = clubClock;
    }

    /**
     * Resolves a day's opening hours into absolute instants.
     *
     * @return empty when the club is closed that day, or when the configured hours do
     *     not resolve to a positive window (possible if hours straddle a DST gap)
     */
    public Optional<OpeningWindow> openingWindow(LocalDate date, OpeningHours hours) {
        return openingWindow(date, hours.isClosed(), hours.getOpenTime(), hours.getCloseTime());
    }

    /**
     * The same resolution for a date-specific override.
     *
     * <p>An override deliberately shares this method rather than resolving its own instants:
     * the spring-forward guard below is easy to omit and impossible to notice missing until a
     * March morning, and one copy of it is the only way both sources stay guarded.
     */
    public Optional<OpeningWindow> openingWindow(LocalDate date, OpeningHoursOverride override) {
        return openingWindow(
                date, override.isClosed(), override.getOpenTime(), override.getCloseTime());
    }

    private Optional<OpeningWindow> openingWindow(
            LocalDate date, boolean closed, LocalTime openTime, LocalTime closeTime) {
        if (closed || openTime == null || closeTime == null) {
            return Optional.empty();
        }

        Instant openAt = clubClock.toInstant(date, openTime);
        Instant closeAt = clubClock.toInstant(date, closeTime);

        if (!openAt.isBefore(closeAt)) {
            // Reachable if opening hours straddle a spring-forward gap, where both
            // times can collapse onto the same instant. Refuse rather than emit a
            // nonsensical window.
            log.warn(
                    "Opening hours for {} resolve to a non-positive window ({} to {}); treating as closed",
                    date,
                    openTime,
                    closeTime);
            return Optional.empty();
        }

        return Optional.of(new OpeningWindow(openAt, closeAt, openTime, closeTime));
    }

    /**
     * Slot start instants across the window, spaced by the configured increment.
     *
     * <p>The last slot starts strictly before closing time. A slot start is included
     * even if a full minimum-length booking would not fit after it; whether it can
     * actually begin a booking is decided later and reported via
     * {@link UnavailableReason#INSUFFICIENT_REMAINING_TIME}.
     */
    public List<Instant> slotStarts(OpeningWindow window, BookingSettings settings) {
        Duration increment = settings.increment();
        if (increment.isZero() || increment.isNegative()) {
            throw new IllegalStateException(
                    "Booking increment must be positive but was " + increment);
        }

        List<Instant> starts = new ArrayList<>();
        for (Instant cursor = window.openAt();
                cursor.isBefore(window.closeAt());
                cursor = cursor.plus(increment)) {
            starts.add(cursor);
        }
        return starts;
    }
}

package uk.co.club.booking.domain.availability;

import java.time.Instant;
import java.time.LocalTime;

/**
 * The club's opening period for one date, resolved from wall-clock opening hours into
 * absolute instants.
 *
 * @param openAt   first bookable instant
 * @param closeAt  instant the club closes; a booking must end at or before this
 * @param openTime club-local opening time, for display
 * @param closeTime club-local closing time, for display
 */
public record OpeningWindow(Instant openAt, Instant closeAt, LocalTime openTime, LocalTime closeTime) {

    public OpeningWindow {
        if (!openAt.isBefore(closeAt)) {
            throw new IllegalArgumentException(
                    "Opening window must be positive but was " + openAt + " to " + closeAt);
        }
    }

    /** Whether the window fully contains a half-open interval. */
    public boolean contains(Instant startAt, Instant endAt) {
        return !startAt.isBefore(openAt) && !endAt.isAfter(closeAt);
    }
}

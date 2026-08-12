package uk.co.club.booking.domain.availability;

import java.time.Instant;
import java.time.LocalTime;

/**
 * One cell of the availability grid.
 *
 * <p>The two booleans answer different questions and conflating them is the classic
 * bug in this kind of grid:
 *
 * <ul>
 *   <li>{@code available} — is this cell unoccupied? Drives the visual heat-map of the
 *       club's day.
 *   <li>{@code bookableForRequestedDuration} — can a booking of the requested length
 *       actually start here? Drives which cells are clickable.
 * </ul>
 *
 * A 22:30 cell in a club closing at 23:00 is {@code available} but not bookable for 90
 * minutes.
 *
 * @param startTime club-local start, matching the grid's time axis
 * @param startAt absolute instant, so the client posts an unambiguous value back
 * @param endTime club-local end of this cell
 * @param available whether the cell is unoccupied
 * @param reason why not, when unavailable; null when available
 * @param bookableForRequestedDuration null when no duration was requested
 * @param maxDurationMinutes longest permitted booking that can start here (0 if none)
 * @param pricePenceForRequestedDuration null when no duration was requested
 */
public record SlotView(
        LocalTime startTime,
        Instant startAt,
        LocalTime endTime,
        boolean available,
        UnavailableReason reason,
        Boolean bookableForRequestedDuration,
        int maxDurationMinutes,
        Integer pricePenceForRequestedDuration) {}

package uk.co.club.booking.domain.availability;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

/**
 * A whole day's availability, shaped so the grid renders with no further computation and
 * no further requests.
 *
 * <p>{@code slotTimes} and {@code durationOptions} are hoisted here rather than repeated
 * per table: the column axis is authoritative instead of something the client derives by
 * unioning per-table arrays, and the payload stays smaller.
 *
 * @param dayUnavailableReason set when the whole day is unbookable (closed, or beyond
 *     the advance window); null on a normal trading day
 */
public record DayAvailability(
        LocalDate date,
        DayOfWeek dayOfWeek,
        String timezone,
        boolean clubOpen,
        LocalTime openingTime,
        LocalTime closingTime,
        int incrementMinutes,
        List<LocalTime> slotTimes,
        List<DurationOption> durationOptions,
        Integer requestedDurationMinutes,
        UnavailableReason dayUnavailableReason,
        List<TableAvailability> tables) {

    /**
     * A permitted booking length. Computed server-side so the client never re-derives
     * min/max/increment arithmetic and offers an option the API would reject.
     */
    public record DurationOption(int minutes, String label) {}
}

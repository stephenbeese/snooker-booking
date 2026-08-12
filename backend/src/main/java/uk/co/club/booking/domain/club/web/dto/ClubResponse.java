package uk.co.club.booking.domain.club.web.dto;

import java.time.LocalTime;
import java.util.List;

/**
 * Public club profile: who we are, when we are open, what it costs.
 *
 * <p>Exists so the marketing pages render configured values rather than hardcoded ones. A
 * home page that states "open 10am–11pm" in JSX is wrong the day an admin edits the
 * opening hours, and wrong silently.
 *
 * <p>Contains no booking rules beyond the headline figures — those belong to the
 * availability contract, which is authoritative and already server-computed.
 */
public record ClubResponse(
        String name,
        String description,
        ContactDetails contact,
        List<DayHours> openingHours,
        /** Cheapest active hourly rate, for a "from £x/hour" headline. */
        int fromHourlyRatePence,
        int minDurationMinutes,
        int maxAdvanceDays) {

    public record ContactDetails(
            String addressLine1,
            String addressLine2,
            String city,
            String postcode,
            String phone,
            String email,
            String website) {}

    /**
     * One weekday's hours.
     *
     * <p>{@code dayOfWeek} is the ISO number (1 = Monday) rather than a localised name: the
     * client formats it, so changing the display language never requires a backend change.
     * {@code openTime} and {@code closeTime} are null when closed.
     */
    public record DayHours(int dayOfWeek, boolean closed, LocalTime openTime, LocalTime closeTime) {}
}

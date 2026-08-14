package uk.co.club.booking.domain.admin.web.dto;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Set;
import uk.co.club.booking.domain.club.BookingSettings;
import uk.co.club.booking.domain.club.ClubSettings;
import uk.co.club.booking.domain.club.OpeningHours;
import uk.co.club.booking.domain.club.OpeningHoursOverride;
import uk.co.club.booking.domain.club.PricingRule;

/** Settings as staff see them. Entities never leave the service layer. */
public final class SettingsResponses {

    private SettingsResponses() {}

    public record ClubDetails(
            String name,
            String addressLine1,
            String addressLine2,
            String city,
            String postcode,
            String phone,
            String email,
            String website,
            String description) {

        public static ClubDetails from(ClubSettings club) {
            return new ClubDetails(
                    club.getName(),
                    club.getAddressLine1(),
                    club.getAddressLine2(),
                    club.getCity(),
                    club.getPostcode(),
                    club.getPhone(),
                    club.getEmail(),
                    club.getWebsite(),
                    club.getDescription());
        }
    }

    /**
     * One day's hours.
     *
     * <p>Unlike the public {@code ClubResponse.DayHours}, the times are returned even when the
     * day is closed. The public view nulls them so a customer is never shown "Sunday closed
     * 12:00–20:00"; staff need the stored values so reopening a day restores its previous
     * hours rather than presenting an empty form.
     */
    public record DayHours(DayOfWeek day, boolean closed, LocalTime openTime, LocalTime closeTime) {

        public static DayHours from(OpeningHours hours) {
            return new DayHours(
                    hours.getDay(), hours.isClosed(), hours.getOpenTime(), hours.getCloseTime());
        }
    }

    /**
     * Special hours for one date.
     *
     * <p>Times are returned even on a closed date, for the same reason as {@link DayHours}:
     * staff reopening the date get its previous hours back rather than an empty form.
     */
    public record DateHours(
            LocalDate date, boolean closed, LocalTime openTime, LocalTime closeTime, String note) {

        public static DateHours from(OpeningHoursOverride override) {
            return new DateHours(
                    override.getDate(),
                    override.isClosed(),
                    override.getOpenTime(),
                    override.getCloseTime(),
                    override.getNote());
        }
    }

    public record BookingRules(
            int minDurationMinutes,
            int maxDurationMinutes,
            int incrementMinutes,
            int minNoticeMinutes,
            int maxAdvanceDays,
            int cancellationNoticeHours,
            int paymentHoldMinutes) {

        public static BookingRules from(BookingSettings settings) {
            return new BookingRules(
                    settings.getMinDurationMinutes(),
                    settings.getMaxDurationMinutes(),
                    settings.getIncrementMinutes(),
                    settings.getMinNoticeMinutes(),
                    settings.getMaxAdvanceDays(),
                    settings.getCancellationNoticeHours(),
                    settings.getPaymentHoldMinutes());
        }
    }

    public record PricingRuleResponse(
            long id,
            String name,
            String tableType,
            /** Empty means every day. Ordered Monday-first so the UI need not sort. */
            Set<DayOfWeek> daysOfWeek,
            LocalTime startTime,
            LocalTime endTime,
            int hourlyRatePence,
            int priority,
            boolean active,
            boolean catchAll) {

        public static PricingRuleResponse from(PricingRule rule) {
            boolean catchAll = rule.getTableType() == null
                    && rule.getDaysOfWeek().isEmpty()
                    && rule.getStartTime() == null
                    && rule.getEndTime() == null;
            return new PricingRuleResponse(
                    rule.getId(),
                    rule.getName(),
                    rule.getTableType(),
                    rule.getDaysOfWeek(),
                    rule.getStartTime(),
                    rule.getEndTime(),
                    rule.getHourlyRatePence(),
                    rule.getPriority(),
                    rule.isActive(),
                    // Published so the UI can warn before staff deactivate the last rule that
                    // can price an arbitrary booking, rather than letting the server refuse
                    // after they have clicked save.
                    catchAll);
        }
    }
}

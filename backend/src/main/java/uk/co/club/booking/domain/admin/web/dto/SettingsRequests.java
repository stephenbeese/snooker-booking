package uk.co.club.booking.domain.admin.web.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Set;
import org.springframework.format.annotation.DateTimeFormat;

/**
 * Request bodies for the settings endpoints.
 *
 * <p>Bean validation here catches the malformed (400). The cross-field rules — max ≥ min,
 * durations divisible by the increment — live in {@code SettingsService}, because they are
 * club rules rather than shape, and they answer 422 with an explanation. The database CHECKs
 * remain the final guarantee behind both.
 */
public final class SettingsRequests {

    private SettingsRequests() {}

    public record ClubDetails(
            @NotBlank @Size(max = 200) String name,
            @Size(max = 200) String addressLine1,
            @Size(max = 200) String addressLine2,
            @Size(max = 100) String city,
            @Size(max = 20) String postcode,
            @Size(max = 30) String phone,
            @Email @Size(max = 255) String email,
            @Size(max = 255) String website,
            @Size(max = 2000) String description) {}

    /** One day. Times may be null only when {@code closed}. */
    public record DayHours(
            @NotNull DayOfWeek day,
            boolean closed,
            @DateTimeFormat(iso = DateTimeFormat.ISO.TIME) LocalTime openTime,
            @DateTimeFormat(iso = DateTimeFormat.ISO.TIME) LocalTime closeTime) {}

    /**
     * The whole week at once.
     *
     * <p>All seven days rather than one at a time: they are a single coherent schedule, and a
     * per-day endpoint invites a half-applied week if a client fails midway through.
     */
    public record OpeningHoursUpdate(@NotEmpty @Valid List<DayHours> days) {}

    /**
     * Special hours for one date. Times may be null only when {@code closed}.
     *
     * <p>The date is in the body rather than the path because this is an upsert: the client
     * states the whole intention ("25 December, closed, 'Christmas Day'") in one place, and
     * there is no create/update distinction for it to get wrong.
     */
    public record OpeningHoursOverrideInput(
            @NotNull @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            boolean closed,
            @DateTimeFormat(iso = DateTimeFormat.ISO.TIME) LocalTime openTime,
            @DateTimeFormat(iso = DateTimeFormat.ISO.TIME) LocalTime closeTime,
            @Size(max = 200) String note) {}

    public record BookingRules(
            @NotNull @Positive Integer minDurationMinutes,
            @NotNull @Positive Integer maxDurationMinutes,
            @NotNull @Positive Integer incrementMinutes,
            @NotNull @PositiveOrZero Integer minNoticeMinutes,
            @NotNull @Positive Integer maxAdvanceDays,
            @NotNull @PositiveOrZero Integer cancellationNoticeHours,
            @NotNull @Min(5) Integer paymentHoldMinutes) {}

    /**
     * A pricing rule. Every narrowing field is optional and null means "matches anything".
     *
     * <p>No id: the path carries it on update, and accepting one in the body would allow a
     * request to edit a different rule from the one its URL names.
     */
    public record PricingRuleInput(
            @NotBlank @Size(max = 100) String name,
            String tableType,
            /**
             * The days this rule covers. Null or empty both mean every day — the same thing a
             * null {@code dayOfWeek} meant before V12, so an older client that omits the field
             * still gets an every-day rule rather than a dead one.
             */
            Set<DayOfWeek> daysOfWeek,
            @DateTimeFormat(iso = DateTimeFormat.ISO.TIME) LocalTime startTime,
            @DateTimeFormat(iso = DateTimeFormat.ISO.TIME) LocalTime endTime,
            @NotNull @Positive Integer hourlyRatePence,
            @NotNull Integer priority,
            boolean active) {}
}

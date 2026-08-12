package uk.co.club.booking.domain.booking.web.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.time.LocalTime;
import org.springframework.format.annotation.DateTimeFormat;

/**
 * A booking request as the customer expresses it: a date and a wall-clock start time, because
 * that is what they picked in the grid.
 *
 * <p>The conversion to an instant happens once, in the controller, via {@code ClubClock}. A
 * client sending an instant directly would be asserting a timezone, and any disagreement about
 * which one becomes an hour-out booking twice a year.
 *
 * <p>Deliberately absent: any price field. Prices are computed server-side from the persisted
 * booking; one supplied by a client is not merely ignored but has nowhere to go.
 */
public record CreateBookingRequest(
        @NotNull @Positive Long tableId,
        @NotNull @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
        @NotNull @DateTimeFormat(iso = DateTimeFormat.ISO.TIME) LocalTime startTime,
        // Bounds are enforced against the club's configured settings by BookingValidator; this
        // only rejects the absurd before any database work happens.
        @NotNull @Min(1) Integer durationMinutes,
        @Size(max = 500) String notes) {}

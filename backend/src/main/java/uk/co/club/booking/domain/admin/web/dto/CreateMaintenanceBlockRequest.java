package uk.co.club.booking.domain.admin.web.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.time.LocalTime;
import org.springframework.format.annotation.DateTimeFormat;

/**
 * A maintenance block as staff express it: a table, a date, and wall-clock times.
 *
 * <p>Club-local rather than instants, for the same reason as {@code CreateBookingRequest} — a
 * client sending an instant is asserting a timezone, and any disagreement becomes an hour-out
 * block twice a year. {@code ClubClock} does the conversion once, in the controller.
 */
public record CreateMaintenanceBlockRequest(
        @NotNull @Positive Long tableId,
        @NotNull @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
        @NotNull @DateTimeFormat(iso = DateTimeFormat.ISO.TIME) LocalTime startTime,
        @NotNull @DateTimeFormat(iso = DateTimeFormat.ISO.TIME) LocalTime endTime,
        @Size(max = 500) String reason) {}

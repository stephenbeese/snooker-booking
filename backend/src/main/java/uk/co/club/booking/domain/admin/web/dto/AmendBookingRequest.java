package uk.co.club.booking.domain.admin.web.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.time.LocalDate;
import java.time.LocalTime;
import org.springframework.format.annotation.DateTimeFormat;

/**
 * Where a booking should move to.
 *
 * <p>Club-local date and time rather than an instant, matching {@code TelephoneBookingRequest}:
 * staff read a grid drawn in the club's own hours, and asking a browser to convert to UTC first
 * is where an hour goes missing twice a year.
 *
 * <p>Carries no price. What a booking costs is captured when it is made, and a figure sent from
 * a screen would be a second opinion about money the server already settled.
 */
public record AmendBookingRequest(
        @NotNull @Positive Long tableId,
        @NotNull @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
        @NotNull @DateTimeFormat(iso = DateTimeFormat.ISO.TIME) LocalTime startTime,
        @NotNull @Min(1) Integer durationMinutes) {}

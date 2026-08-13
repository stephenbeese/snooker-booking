package uk.co.club.booking.domain.admin.web.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.time.LocalTime;
import org.springframework.format.annotation.DateTimeFormat;

/**
 * A booking taken over the telephone.
 *
 * <p>Carries the customer's details as well as the slot, because staff are speaking to somebody
 * who may not have an account. The email is the identity: an existing account is reused rather
 * than duplicated, so a customer who later signs up finds their telephone bookings already
 * there.
 *
 * <p>No price field, deliberately — as with online bookings, the price is computed server-side
 * from the persisted booking. Staff quoting a figure down the phone does not change what the
 * club's own pricing rules say the slot costs.
 */
public record TelephoneBookingRequest(
        @NotNull @Positive Long tableId,
        @NotNull @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
        @NotNull @DateTimeFormat(iso = DateTimeFormat.ISO.TIME) LocalTime startTime,
        @NotNull @Min(1) Integer durationMinutes,
        @NotBlank @Email @Size(max = 255) String customerEmail,
        @NotBlank @Size(max = 100) String firstName,
        @NotBlank @Size(max = 100) String lastName,
        @Size(max = 30) String customerPhone,
        @Size(max = 500) String notes) {}

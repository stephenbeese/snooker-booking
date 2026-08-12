package uk.co.club.booking.domain.booking.web.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import uk.co.club.booking.common.time.ClubClock;
import uk.co.club.booking.domain.booking.Booking;
import uk.co.club.booking.domain.booking.BookingStatus;

/**
 * A booking as the client needs it.
 *
 * <p>Carries both the instants and the club-local date/time. The instants are authoritative;
 * the local values save every client from reimplementing the timezone conversion and getting it
 * subtly wrong.
 *
 * <p>Never exposes the internal id — only the opaque reference, which is what URLs and phone
 * conversations use. A sequential id in a URL invites enumeration.
 */
public record BookingResponse(
        String reference,
        long tableId,
        String tableName,
        LocalDate date,
        LocalTime startTime,
        LocalTime endTime,
        Instant startAt,
        Instant endAt,
        int durationMinutes,
        int pricePence,
        BookingStatus status,
        Instant holdExpiresAt,
        String customerName,
        String notes) {

    public static BookingResponse from(Booking booking, ClubClock clock) {
        return new BookingResponse(
                booking.getReference(),
                booking.getSnookerTable().getId(),
                booking.getSnookerTable().getName(),
                clock.toLocalDate(booking.getStartAt()),
                clock.toLocalTime(booking.getStartAt()),
                clock.toLocalTime(booking.getEndAt()),
                booking.getStartAt(),
                booking.getEndAt(),
                booking.getDurationMinutes(),
                booking.getPricePence(),
                booking.getStatus(),
                booking.getHoldExpiresAt(),
                booking.getCustomerName(),
                booking.getNotes());
    }
}

package uk.co.club.booking.domain.booking.web.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import uk.co.club.booking.common.time.ClubClock;
import uk.co.club.booking.domain.booking.Booking;
import uk.co.club.booking.domain.booking.BookingStatus;
import uk.co.club.booking.domain.booking.CancellationPolicy;

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
        String notes,
        /**
         * Whether the caller may cancel this booking right now, decided by the server.
         *
         * <p>Sent rather than derived on the client. The rule depends on the configured notice
         * period and the server's clock, so a client that computed it would show an enabled
         * button the API then rejects — or worse, a disabled one when cancellation was allowed.
         */
        boolean cancellable,
        /** When the cancellation window closes; null when no notice period applies. */
        Instant cancellableUntil,
        /** Why not, in words fit to show a customer. Null when cancellable. */
        String cancellationBlockedReason,
        Instant cancelledAt) {

    /** For lists and detail views, where the cancel option must be described. */
    public static BookingResponse from(
            Booking booking, ClubClock clock, CancellationPolicy.Decision cancellation) {
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
                booking.getNotes(),
                cancellation.cancellable(),
                cancellation.cancellableUntil(),
                cancellation.message(),
                booking.getCancelledAt());
    }
}

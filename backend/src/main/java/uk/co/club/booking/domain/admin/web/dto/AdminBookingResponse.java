package uk.co.club.booking.domain.admin.web.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import uk.co.club.booking.common.time.ClubClock;
import uk.co.club.booking.domain.booking.Booking;
import uk.co.club.booking.domain.booking.BookingSource;
import uk.co.club.booking.domain.booking.BookingStatus;
import uk.co.club.booking.domain.booking.CancellationPolicy;
import uk.co.club.booking.domain.payment.PaymentStatus;
import uk.co.club.booking.domain.payment.PaymentSummary;

/**
 * A booking as staff need it.
 *
 * <p>Separate from the customer's {@code BookingResponse} rather than a superset of it, because
 * the extra fields here are exactly the ones a customer must never receive: another customer's
 * email and phone number. Adding them to the shared DTO and hoping every customer-facing
 * endpoint nulls them out is the shape that leaks.
 *
 * <p>Still no internal id — staff work from the reference too, and it keeps enumeration off the
 * table for a compromised admin session as much as for anyone else.
 *
 * @param paymentStatus null when the booking has no payment row at all — an online hold not yet
 *     handed to Stripe, or anything created before payments existed. Distinct from a zero
 *     outstanding amount, which means settled.
 * @param amountOutstandingPence what the club is still owed; zero once settled
 * @param payableAtCounter true when staff must take money as the customer walks in
 * @param tableType the type's code, not its label. The label is editable and lives in one place
 *     — {@code /api/tables/types}, which the client already reads to caption the grid — so
 *     sending it here too would ship a second copy that goes stale when a manager renames one.
 */
public record AdminBookingResponse(
        String reference,
        long tableId,
        String tableName,
        String tableType,
        LocalDate date,
        LocalTime startTime,
        LocalTime endTime,
        Instant startAt,
        Instant endAt,
        int durationMinutes,
        int pricePence,
        BookingStatus status,
        BookingSource source,
        Instant holdExpiresAt,
        String customerName,
        String customerEmail,
        String customerPhone,
        String notes,
        boolean cancellable,
        String cancellationBlockedReason,
        Instant cancelledAt,
        String cancellationReason,
        Instant createdAt,
        PaymentStatus paymentStatus,
        int amountOutstandingPence,
        boolean payableAtCounter) {

    public static AdminBookingResponse from(
            Booking booking,
            ClubClock clock,
            CancellationPolicy.Decision cancellation,
            PaymentSummary payment) {
        return new AdminBookingResponse(
                booking.getReference(),
                booking.getSnookerTable().getId(),
                booking.getSnookerTable().getName(),
                booking.getSnookerTable().getTableType(),
                clock.toLocalDate(booking.getStartAt()),
                clock.toLocalTime(booking.getStartAt()),
                clock.toLocalTime(booking.getEndAt()),
                booking.getStartAt(),
                booking.getEndAt(),
                booking.getDurationMinutes(),
                booking.getPricePence(),
                booking.getStatus(),
                booking.getSource(),
                booking.getHoldExpiresAt(),
                booking.getCustomerName(),
                booking.getCustomerEmail(),
                booking.getCustomerPhone(),
                booking.getNotes(),
                cancellation.cancellable(),
                cancellation.message(),
                booking.getCancelledAt(),
                booking.getCancellationReason(),
                booking.getCreatedAt(),
                payment.status(),
                payment.outstandingPence(),
                payment.dueAtCounter());
    }
}

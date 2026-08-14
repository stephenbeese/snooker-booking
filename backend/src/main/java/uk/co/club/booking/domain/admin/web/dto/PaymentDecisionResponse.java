package uk.co.club.booking.domain.admin.web.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import uk.co.club.booking.domain.payment.PaymentStatus;

/**
 * One unresolved payment decision, with enough of its booking to act on.
 *
 * <p>The dashboard counted these and named none of them, so "3 payments need a decision" was a
 * number with nothing behind it: no way to see which bookings, whose money, or how much. Carrying
 * the booking here rather than making the client fetch each one keeps the queue one request, and
 * the queue is read far more often than any single row is opened.
 *
 * @param reference the booking's reference, which is what staff and customers both quote
 * @param amountPence what was taken, and therefore the most that can go back
 * @param paymentStatus where the money stands now — SUCCEEDED means it is still with the club
 * @param refundable whether this can be sent back through the provider. Counter cash and
 *     waived bookings are settled but have no card payment behind them, so they are settled by
 *     hand and only ever marked resolved here.
 */
public record PaymentDecisionResponse(
        long id,
        String reference,
        String tableName,
        LocalDate date,
        LocalTime startTime,
        LocalTime endTime,
        String customerName,
        String customerEmail,
        String customerPhone,
        int amountPence,
        PaymentStatus paymentStatus,
        boolean refundable,
        String reason,
        Instant raisedAt) {}

package uk.co.club.booking.domain.admin;

import java.time.LocalDate;

/**
 * The dashboard figures, as computed by the server.
 *
 * @param date the club-local day these figures describe
 * @param bookedToday confirmed or completed sessions starting today
 * @param stillToCome today's slot-occupying bookings that have not started yet
 * @param cancelledToday cancellations among today's sessions
 * @param awaitingPayment live holds still within their payment window
 * @param expectedRevenuePence committed takings for today, in pence — never a float
 * @param paymentExceptions unresolved anomalies waiting for a staff decision
 */
public record AdminDashboard(
        LocalDate date,
        long bookedToday,
        long stillToCome,
        long cancelledToday,
        long awaitingPayment,
        int expectedRevenuePence,
        int paymentExceptions) {}

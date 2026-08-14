package uk.co.club.booking.domain.admin.web;

import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;
import uk.co.club.booking.common.time.ClubClock;
import uk.co.club.booking.domain.admin.web.dto.AdminBookingResponse;
import uk.co.club.booking.domain.booking.Booking;
import uk.co.club.booking.domain.booking.BookingService;
import uk.co.club.booking.domain.payment.PaymentService;
import uk.co.club.booking.domain.payment.PaymentSummary;

/**
 * Turns bookings into the staff-facing response.
 *
 * <p>Its own component because two controllers now need it — the booking list and the customer
 * record — and the mapping is not trivial: it carries a cancellation decision and a payment
 * summary, both of which have a cheap batched form and an expensive per-row one. Copied into a
 * second controller, the copy would sooner or later be the {@code map(this::one)} version, and
 * the customer screen would quietly issue a query per booking.
 */
@Component
public class AdminBookingMapper {

    private final BookingService bookingService;
    private final PaymentService paymentService;
    private final ClubClock clubClock;

    public AdminBookingMapper(
            BookingService bookingService, PaymentService paymentService, ClubClock clubClock) {
        this.bookingService = bookingService;
        this.paymentService = paymentService;
        this.clubClock = clubClock;
    }

    /** One booking, with its own payment lookup. */
    public AdminBookingResponse one(Booking booking) {
        return build(booking, paymentService.summarise(booking));
    }

    /**
     * Many bookings, fetching every payment in one query.
     *
     * <p>Not {@code map(this::one)}: that would summarise each booking separately and turn a
     * 25-row page into 26 queries.
     */
    public List<AdminBookingResponse> many(List<Booking> bookings) {
        Map<Long, PaymentSummary> payments = paymentService.summariseAll(bookings);
        return bookings.stream()
                .map(booking -> build(
                        booking, payments.getOrDefault(booking.getId(), PaymentSummary.NONE)))
                .toList();
    }

    private AdminBookingResponse build(Booking booking, PaymentSummary payment) {
        return AdminBookingResponse.from(
                booking, clubClock, bookingService.cancellation(booking, true), payment);
    }
}

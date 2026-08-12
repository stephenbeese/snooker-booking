package uk.co.club.booking.domain.booking.web;

import jakarta.validation.Valid;
import java.time.Instant;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uk.co.club.booking.common.time.ClubClock;
import uk.co.club.booking.domain.booking.Booking;
import uk.co.club.booking.domain.booking.BookingPolicy;
import uk.co.club.booking.domain.booking.BookingService;
import uk.co.club.booking.domain.booking.BookingSource;
import uk.co.club.booking.domain.booking.CreateBookingCommand;
import uk.co.club.booking.domain.booking.web.dto.BookingResponse;
import uk.co.club.booking.domain.booking.web.dto.CheckoutResponse;
import uk.co.club.booking.domain.booking.web.dto.CreateBookingRequest;
import uk.co.club.booking.domain.payment.PaymentService;
import uk.co.club.booking.domain.user.User;
import uk.co.club.booking.domain.user.UserService;
import uk.co.club.booking.security.AppUserPrincipal;

/**
 * Customer booking endpoints.
 *
 * <p>Thin by design: it converts between the client's wall-clock vocabulary and the domain's
 * instants, and delegates every rule to {@link BookingService}. No rule is implemented here,
 * because a rule implemented in a controller is a rule the admin path will not apply.
 */
@RestController
@RequestMapping("/api/bookings")
public class BookingController {

    private final BookingService bookingService;
    private final PaymentService paymentService;
    private final UserService userService;
    private final ClubClock clubClock;

    public BookingController(
            BookingService bookingService,
            PaymentService paymentService,
            UserService userService,
            ClubClock clubClock) {
        this.bookingService = bookingService;
        this.paymentService = paymentService;
        this.userService = userService;
        this.clubClock = clubClock;
    }

    /**
     * Creates a booking and starts payment.
     *
     * <p>Two steps in a deliberate order: the slot is held in a committed transaction first, and
     * only then is Stripe contacted. Reversing them would mean taking money for a slot that may
     * already be gone.
     *
     * <p>Returns 201 with the booking and a {@code checkoutUrl} for the SPA to redirect to.
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CheckoutResponse create(
            @Valid @RequestBody CreateBookingRequest request,
            @AuthenticationPrincipal AppUserPrincipal principal) {

        User user = userService.require(principal.id());

        // The single conversion point from the customer's wall clock to a physical instant.
        Instant startAt = clubClock.toInstant(request.date(), request.startTime());

        Booking booking = bookingService.create(
                new CreateBookingCommand(
                        request.tableId(),
                        startAt,
                        request.durationMinutes(),
                        user.getId(),
                        user.fullName(),
                        user.getEmail(),
                        user.getPhone(),
                        request.notes(),
                        BookingSource.ONLINE,
                        user.getId()),
                BookingPolicy.online());

        // Outside the creating transaction: an HTTP call to Stripe must not hold a database
        // connection open, and the hold must be durable before any money is involved.
        String checkoutUrl = paymentService.startCheckout(booking);

        return new CheckoutResponse(BookingResponse.from(booking, clubClock), checkoutUrl);
    }

    /** The signed-in customer's bookings, newest first. */
    @GetMapping
    public List<BookingResponse> myBookings(@AuthenticationPrincipal AppUserPrincipal principal) {
        return bookingService.forUser(principal.id()).stream()
                .map(booking -> BookingResponse.from(booking, clubClock))
                .toList();
    }

    /**
     * One booking by reference.
     *
     * <p>The SPA polls this after returning from Stripe: the webhook may not have landed yet, so
     * PENDING_PAYMENT is a legitimate "confirming…" state rather than a failure.
     */
    @GetMapping("/{reference}")
    public BookingResponse byReference(
            @PathVariable String reference, @AuthenticationPrincipal AppUserPrincipal principal) {
        Booking booking = bookingService.requireByReference(reference);
        // 404 rather than 403 for somebody else's booking — see BookingService.requireOwnership.
        bookingService.requireOwnership(booking, principal.id(), principal.isAdmin());
        return BookingResponse.from(booking, clubClock);
    }

    /**
     * Starts a fresh Checkout session for a booking whose payment failed.
     *
     * <p>Needed because a declined card leaves the hold alive: the customer should be able to
     * try another card without losing the slot and rebooking from scratch.
     */
    @PostMapping("/{reference}/checkout")
    public CheckoutResponse retryCheckout(
            @PathVariable String reference, @AuthenticationPrincipal AppUserPrincipal principal) {
        Booking booking = bookingService.requireByReference(reference);
        bookingService.requireOwnership(booking, principal.id(), principal.isAdmin());
        String checkoutUrl = paymentService.startCheckout(booking);
        return new CheckoutResponse(BookingResponse.from(booking, clubClock), checkoutUrl);
    }
}

package uk.co.club.booking.domain.admin.web;

import jakarta.validation.Valid;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uk.co.club.booking.common.time.ClubClock;
import uk.co.club.booking.domain.admin.AdminBookingQuery;
import uk.co.club.booking.domain.admin.AdminBookingService;
import uk.co.club.booking.domain.admin.AdminDashboard;
import uk.co.club.booking.domain.admin.web.dto.AdminBookingResponse;
import uk.co.club.booking.domain.admin.web.dto.PagedResponse;
import uk.co.club.booking.domain.admin.web.dto.TelephoneBookingRequest;
import uk.co.club.booking.domain.booking.Booking;
import uk.co.club.booking.domain.booking.BookingPolicy;
import uk.co.club.booking.domain.booking.BookingService;
import uk.co.club.booking.domain.booking.BookingSource;
import uk.co.club.booking.domain.booking.BookingStatus;
import uk.co.club.booking.domain.booking.CreateBookingCommand;
import uk.co.club.booking.domain.booking.web.dto.CancelBookingRequest;
import uk.co.club.booking.domain.payment.PaymentService;
import uk.co.club.booking.domain.user.User;
import uk.co.club.booking.domain.user.UserService;
import uk.co.club.booking.security.AppUserPrincipal;

/**
 * Staff booking management.
 *
 * <p>Authorisation is not implemented here. Every path under {@code /api/admin/**} requires the
 * ADMIN role in {@code SecurityConfig}, which is checked before this class is reached — a
 * per-method check as well would be a second place to forget. What this class does owe is the
 * discipline of never re-implementing a rule: cancellation goes through the same
 * {@code BookingService.cancel} the customer endpoint uses, differing only in the
 * {@code isAdmin} flag it passes.
 */
@RestController
@RequestMapping("/api/admin")
public class AdminBookingController {

    private final AdminBookingService adminBookingService;
    private final BookingService bookingService;
    private final PaymentService paymentService;
    private final UserService userService;
    private final ClubClock clubClock;

    public AdminBookingController(
            AdminBookingService adminBookingService,
            BookingService bookingService,
            PaymentService paymentService,
            UserService userService,
            ClubClock clubClock) {
        this.adminBookingService = adminBookingService;
        this.bookingService = bookingService;
        this.paymentService = paymentService;
        this.userService = userService;
        this.clubClock = clubClock;
    }

    /** Today's figures. */
    @GetMapping("/dashboard")
    public AdminDashboard dashboard() {
        return adminBookingService.dashboard();
    }

    /**
     * The booking list, filtered and paged.
     *
     * <p>Every parameter optional: with none supplied this is "all bookings, newest first",
     * which is the sensible landing state.
     */
    @GetMapping("/bookings")
    public PagedResponse<AdminBookingResponse> list(
            @RequestParam(required = false) Set<BookingStatus> status,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
                    LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
                    LocalDate to,
            @RequestParam(required = false) Long tableId,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size) {

        AdminBookingQuery query =
                new AdminBookingQuery(status, from, to, tableId, search, page, size);
        return PagedResponse.of(adminBookingService.search(query), this::toResponse);
    }

    /** One day's bookings in start order, for the day view. */
    @GetMapping("/bookings/day")
    public List<AdminBookingResponse> day(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
                    LocalDate date) {
        LocalDate target = date == null ? clubClock.today() : date;
        return adminBookingService.forDay(target).stream().map(this::toResponse).toList();
    }

    /** One booking in full. */
    @GetMapping("/bookings/{reference}")
    public AdminBookingResponse byReference(@PathVariable String reference) {
        return toResponse(bookingService.requireByReference(reference));
    }

    /**
     * Takes a booking over the telephone.
     *
     * <h2>Why this is not the online flow with a flag</h2>
     *
     * It routes through the same {@link BookingService#create} and therefore the same
     * {@code BookingValidator} — every rule about overlap, maintenance, inactive tables and
     * opening hours applies exactly as it does online. What differs is expressed entirely in
     * {@code BookingPolicy.staff()}: notice and advance limits are lifted, and the booking is
     * created CONFIRMED rather than held.
     *
     * <p>No payment hold, because a hold exists to reserve inventory while an unsupervised
     * customer fetches a card. Here a member of staff is on the phone and the slot is committed
     * immediately. Payment is settled at the counter, outside this system — there is no
     * card-over-the-phone in the MVP.
     *
     * <p>The customer is found or created by email, so a caller who already has an account gets
     * the booking on it rather than a duplicate shell account.
     */
    @PostMapping("/bookings/telephone")
    @ResponseStatus(HttpStatus.CREATED)
    public AdminBookingResponse telephoneBooking(
            @Valid @RequestBody TelephoneBookingRequest request,
            @AuthenticationPrincipal AppUserPrincipal principal) {

        User customer = userService.findOrCreateForTelephone(
                request.customerEmail().trim().toLowerCase(),
                request.firstName(),
                request.lastName(),
                request.customerPhone());

        Instant startAt = clubClock.toInstant(request.date(), request.startTime());

        Booking booking = bookingService.create(
                new CreateBookingCommand(
                        request.tableId(),
                        startAt,
                        request.durationMinutes(),
                        customer.getId(),
                        customer.getFirstName() + " " + customer.getLastName(),
                        customer.getEmail(),
                        // Prefer what the caller just said over what the account has on file:
                        // they may be ringing from a different number and correcting it.
                        request.customerPhone() == null || request.customerPhone().isBlank()
                                ? customer.getPhone()
                                : request.customerPhone(),
                        request.notes(),
                        BookingSource.TELEPHONE,
                        principal.id()),
                BookingPolicy.staff());

        return toResponse(booking);
    }

    /**
     * Cancels any booking, on the customer's behalf.
     *
     * <p>Staff bypass the notice period — that is the whole point of ringing the club — but not
     * the rest: a booking that has already started or already ended cannot be cancelled by
     * anyone, because the session either is happening or has happened.
     */
    @PostMapping("/bookings/{reference}/cancel")
    public AdminBookingResponse cancel(
            @PathVariable String reference,
            @Valid @RequestBody(required = false) CancelBookingRequest request,
            @AuthenticationPrincipal AppUserPrincipal principal) {

        Booking booking = bookingService.requireByReference(reference);
        String reason = request == null ? null : request.reason();

        boolean cancelled = bookingService.cancel(booking, principal.id(), true, reason);
        if (cancelled) {
            // Same ordering as the customer path: after the cancelling transaction has
            // committed, so a failure here cannot undo a cancellation staff have been shown.
            paymentService.flagForRefundIfPaid(booking);
        }

        // Re-read: cancelIfLive is a bulk update, so the entity in hand still shows the old
        // status.
        return toResponse(bookingService.requireByReference(reference));
    }

    private AdminBookingResponse toResponse(Booking booking) {
        return AdminBookingResponse.from(
                booking, clubClock, bookingService.cancellation(booking, true));
    }
}

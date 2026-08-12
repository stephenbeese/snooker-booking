package uk.co.club.booking.domain.payment;

import java.time.format.DateTimeFormatter;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import uk.co.club.booking.common.error.BusinessRuleException;
import uk.co.club.booking.common.error.ErrorCode;
import uk.co.club.booking.common.time.ClubClock;
import uk.co.club.booking.domain.booking.Booking;
import uk.co.club.booking.domain.booking.BookingService;
import uk.co.club.booking.domain.booking.BookingStatus;

/**
 * Takes payment for a held booking, and confirms it when the money arrives.
 *
 * <h2>Ordering</h2>
 *
 * The slot is reserved <em>before</em> Stripe is contacted, never after. Charging first and
 * reserving afterwards guarantees eventually selling a slot that is already gone — and then
 * owing a refund and an apology. Holding first means the worst case is an unused hold that
 * expires by itself.
 *
 * <p>The Stripe call also happens strictly <em>outside</em> the database transaction that
 * created the hold. An HTTP call inside a transaction holds a database connection open for the
 * round trip, and a slow provider becomes connection-pool exhaustion for the whole application.
 */
@Service
public class PaymentService {

    private static final Logger log = LoggerFactory.getLogger(PaymentService.class);

    private static final DateTimeFormatter DESCRIPTION_FORMAT =
            DateTimeFormatter.ofPattern("EEE d MMM, HH:mm");

    private final PaymentRepository paymentRepository;
    private final PaymentExceptionRepository paymentExceptionRepository;
    private final CheckoutGateway checkoutGateway;
    private final BookingService bookingService;
    private final ClubClock clubClock;
    private final String baseUrl;

    /**
     * This bean, through its Spring proxy.
     *
     * <p>Needed because {@code @Transactional} is implemented by that proxy: an internal
     * {@code this.foo()} call never crosses it, so the annotation is silently ignored and the
     * method runs in the caller's transaction — or in none at all.
     *
     * <p>An {@code ObjectProvider} rather than injecting {@code PaymentService} directly: the
     * latter is a self-reference that Spring resolves eagerly and which fails on a circular
     * dependency. This resolves on first use, by which time the context is built.
     */
    private final ObjectProvider<PaymentService> self;

    public PaymentService(
            PaymentRepository paymentRepository,
            PaymentExceptionRepository paymentExceptionRepository,
            CheckoutGateway checkoutGateway,
            BookingService bookingService,
            ClubClock clubClock,
            @Value("${app.base-url}") String baseUrl,
            ObjectProvider<PaymentService> self) {
        this.paymentRepository = paymentRepository;
        this.paymentExceptionRepository = paymentExceptionRepository;
        this.checkoutGateway = checkoutGateway;
        this.bookingService = bookingService;
        this.clubClock = clubClock;
        this.baseUrl = baseUrl;
        this.self = self;
    }

    /**
     * Starts a Checkout session for a booking that is already holding its slot.
     *
     * <p>Called after the creating transaction has committed, so the hold is durable before any
     * money is involved.
     *
     * @return the URL to redirect the customer to
     */
    public String startCheckout(Booking booking) {
        if (booking.getStatus() != BookingStatus.PENDING_PAYMENT) {
            // A confirmed or cancelled booking has nothing to pay for. Notably this also stops
            // a second payment being taken for a booking staff already marked paid at the
            // counter.
            throw new BusinessRuleException(
                    ErrorCode.PAYMENT_NOT_REQUIRED, "This booking is not awaiting payment.");
        }

        Payment payment = self.getObject().recordAttempt(booking);

        CheckoutGateway.CheckoutSession session = checkoutGateway.createSession(
                new CheckoutGateway.CheckoutRequest(
                        booking.getReference(),
                        booking.getId(),
                        describe(booking),
                        booking.getPricePence(),
                        "gbp",
                        booking.getCustomerEmail(),
                        baseUrl + "/bookings/" + booking.getReference() + "?payment=complete",
                        baseUrl + "/bookings/" + booking.getReference() + "?payment=cancelled"),
                // Per attempt, not per booking: a customer retrying after a decline must get a
                // fresh session, while a retried HTTP call for the same attempt must not.
                "booking-" + booking.getReference() + "-attempt-" + payment.getId());

        self.getObject().attachSession(payment.getId(), session);
        return session.url();
    }

    /**
     * Records the attempt before calling Stripe, so an unanswered call still leaves a trace.
     *
     * <p>Annotated {@code REQUIRES_NEW} but invoked through {@code self}, not {@code this}.
     * A plain {@code this.recordAttempt(...)} call bypasses the Spring proxy entirely and the
     * annotation does nothing — the row would then be written in whatever transaction happens
     * to be active, or none, and would not be durable before the Stripe call.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Payment recordAttempt(Booking booking) {
        Payment payment = new Payment(
                booking.getId(), PaymentStatus.REQUIRES_PAYMENT, booking.getPricePence());
        return paymentRepository.saveAndFlush(payment);
    }

    /** Commits the Stripe identifiers. Same proxy caveat as {@link #recordAttempt}. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void attachSession(long paymentId, CheckoutGateway.CheckoutSession session) {
        paymentRepository.findById(paymentId).ifPresent(payment -> {
            payment.setStripeCheckoutSessionId(session.sessionId());
            payment.setStripePaymentIntentId(session.paymentIntentId());
            payment.setStatus(PaymentStatus.PROCESSING);
            paymentRepository.saveAndFlush(payment);
        });
    }

    /**
     * Records a successful payment and confirms the booking.
     *
     * <p>Idempotent, and reached from two uncoordinated directions: the Stripe webhook and the
     * customer's browser returning from Checkout. Neither can be relied on to arrive first, or
     * at all — webhooks can be delayed by minutes, and a customer can close the tab before
     * being redirected. Whichever arrives first does the work; the other is a no-op.
     *
     * @return the booking, confirmed
     */
    @Transactional
    public Optional<Booking> markPaid(String sessionId, String paymentIntentId, String chargeId) {
        Optional<Payment> maybePayment = paymentRepository.findByStripeCheckoutSessionId(sessionId);
        if (maybePayment.isEmpty()) {
            // Not necessarily an attack: a session created by a different environment pointed
            // at the same Stripe account will land here. Log and ignore rather than 500.
            log.warn("Received payment confirmation for unknown session {}", sessionId);
            return Optional.empty();
        }

        Payment payment = maybePayment.get();
        if (payment.getStatus() == PaymentStatus.SUCCEEDED) {
            log.debug("Session {} already recorded as paid; ignoring duplicate", sessionId);
            return Optional.of(bookingService.requireById(payment.getBookingId()));
        }

        payment.setStatus(PaymentStatus.SUCCEEDED);
        if (paymentIntentId != null) {
            payment.setStripePaymentIntentId(paymentIntentId);
        }
        payment.setStripeChargeId(chargeId);
        paymentRepository.save(payment);

        boolean confirmed = bookingService.confirmPaid(payment.getBookingId());
        if (!confirmed) {
            // The booking was not PENDING_PAYMENT. Either this is the second of the two
            // confirmation paths (harmless), or the hold lapsed before the money arrived.
            handleLatePayment(payment);
        }
        return Optional.of(bookingService.requireById(payment.getBookingId()));
    }

    /**
     * Money arrived after the hold was released.
     *
     * <p>Structurally reachable rather than theoretical: Stripe's minimum session expiry is 30
     * minutes and the default hold is 15, so a slow customer can pay for a slot the sweeper has
     * already freed. Try to give them the slot back; if it has genuinely been resold, keep the
     * payment and raise it for staff — silently refunding would be a worse surprise than a
     * phone call, and silently overwriting the new booking would be worse still.
     */
    private void handleLatePayment(Payment payment) {
        Booking booking = bookingService.requireById(payment.getBookingId());
        if (booking.getStatus() == BookingStatus.CONFIRMED) {
            return; // The other confirmation path won the race. Nothing to do.
        }

        if (bookingService.tryReinstate(payment.getBookingId())) {
            log.info(
                    "Late payment reinstated booking {} — the slot was still free",
                    booking.getReference());
            return;
        }

        log.warn(
                "Payment {} succeeded but booking {} could not be reinstated; raising for staff",
                payment.getId(),
                booking.getReference());
        paymentExceptionRepository.save(new PaymentException(
                booking.getId(),
                payment.getId(),
                "Payment succeeded after the hold expired and the slot was no longer available."));
    }

    /** Records a declined payment. The hold survives so the customer can retry within its TTL. */
    @Transactional
    public void markFailed(String paymentIntentId, String failureCode, String failureMessage) {
        paymentRepository.findByStripePaymentIntentId(paymentIntentId).ifPresent(payment -> {
            payment.setStatus(PaymentStatus.FAILED);
            payment.setFailureCode(failureCode);
            // Stripe's decline reason is a coarse category, never card data.
            payment.setFailureMessage(failureMessage);
            paymentRepository.save(payment);
            log.info("Payment {} failed: {}", payment.getId(), failureCode);
        });
    }

    /** Expires the Stripe session behind a hold the sweeper is about to release. */
    public void cancelCheckoutFor(long bookingId) {
        paymentRepository.findByBookingIdOrderByIdDesc(bookingId).stream()
                .filter(payment -> payment.getStripeCheckoutSessionId() != null)
                .filter(payment -> payment.getStatus() != PaymentStatus.SUCCEEDED)
                .findFirst()
                .ifPresent(payment -> {
                    // Shrinks the "paid after the hold expired" window from ~15 minutes to
                    // seconds. Best-effort by design; see StripeCheckoutGateway.
                    checkoutGateway.expireSession(payment.getStripeCheckoutSessionId());
                });
    }

    private String describe(Booking booking) {
        return "%s — %s"
                .formatted(
                        booking.getSnookerTable().getName(),
                        DESCRIPTION_FORMAT.format(
                                booking.getStartAt().atZone(clubClock.zone())));
    }
}

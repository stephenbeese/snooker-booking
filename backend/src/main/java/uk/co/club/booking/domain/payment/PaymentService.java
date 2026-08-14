package uk.co.club.booking.domain.payment;

import java.time.format.DateTimeFormatter;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;
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

    /** Matches {@code payment_provider_valid} in V10. */
    private static final String COUNTER_PROVIDER = "COUNTER";

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

        // Before creating anything payable, settle what the previous attempt actually did.
        // The booking status above is not enough on its own: it still reads PENDING_PAYMENT
        // for a payment that succeeded at Stripe whose webhook was delayed, dropped, or —
        // in development — never forwarded at all. Skipping this check is what charges a
        // customer twice for one slot.
        Optional<String> existing = reuseOrSettleExistingAttempt(booking);
        if (existing.isPresent()) {
            return existing.get();
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
     * Decides whether a new payable session may be created at all.
     *
     * <p>The double-charge this prevents: the customer pays, the confirming webhook does not
     * arrive, the booking still reads PENDING_PAYMENT, the page offers "Pay now", and Stripe —
     * given a fresh idempotency key derived from the new attempt row — happily creates a second
     * session and takes the money again. Both charges are real and only one is refundable
     * without someone noticing.
     *
     * <p>Three outcomes, in order of precedence:
     *
     * <ul>
     *   <li><b>Already paid.</b> Confirm the booking from Stripe's answer and hand back no URL.
     *       This makes a missed webhook self-healing on the customer's next click.
     *   <li><b>Still open.</b> Return the existing session's URL. The customer carries on with
     *       the checkout they already have rather than acquiring a second payable one.
     *   <li><b>Unknown.</b> Stripe could not be read. Refuse rather than charge: an unreachable
     *       provider is not evidence that no money was taken.
     * </ul>
     *
     * <p><b>Not locked.</b> Two genuinely simultaneous clicks can both read "no session yet"
     * and each create one, because this reads outside any lock. That is a narrower window than
     * the bug it fixes — which needed only a slow webhook and a page reload, seconds or minutes
     * apart — and closing it means a row lock on the booking for the duration of a Stripe
     * round trip, which is the pattern this class deliberately avoids (see the class javadoc on
     * why HTTP calls stay outside transactions). If it ever bites, the fix is a short advisory
     * lock keyed on the booking id, taken and released around this method only.
     *
     * @return the URL to send the customer to, or empty when a genuinely new session is needed
     */
    private Optional<String> reuseOrSettleExistingAttempt(Booking booking) {
        Optional<Payment> maybeLatest = paymentRepository.findByBookingIdOrderByIdDesc(booking.getId())
                .stream()
                .filter(candidate -> candidate.getStripeCheckoutSessionId() != null)
                .findFirst();
        if (maybeLatest.isEmpty()) {
            return Optional.empty();
        }

        Payment latest = maybeLatest.get();
        if (latest.getStatus().isSettled()) {
            // Settled locally but the booking is still pending: staff took the money at the
            // counter between the customer opening this page and clicking. Nothing to pay.
            throw new BusinessRuleException(
                    ErrorCode.PAYMENT_NOT_REQUIRED, "This booking has already been paid for.");
        }
        if (latest.getStatus() == PaymentStatus.FAILED) {
            // A declined card is the one case where a brand-new session is right: the old one
            // cannot be paid, and the customer wants to try a different card.
            return Optional.empty();
        }

        String sessionId = latest.getStripeCheckoutSessionId();
        Optional<CheckoutGateway.SessionState> maybeState = checkoutGateway.fetchSession(sessionId);
        if (maybeState.isEmpty()) {
            // Deliberately a refusal, not a fallthrough to creating a session. If Stripe cannot
            // be reached we do not know whether the previous attempt took the money, and
            // guessing "it did not" is what charges the customer twice.
            throw new BusinessRuleException(
                    ErrorCode.PAYMENT_PROVIDER_ERROR,
                    "We could not check your previous payment. Your slot is still held — "
                            + "please try again in a moment.");
        }

        CheckoutGateway.SessionState state = maybeState.get();
        if (state.paid()) {
            log.info(
                    "Session {} for booking {} was already paid; confirming without a new checkout",
                    sessionId,
                    booking.getReference());
            // Through markPaid, not a bespoke update: it is the same idempotent path the
            // webhook uses, so a late webhook arriving afterwards is a harmless no-op.
            self.getObject().markPaid(sessionId, state.paymentIntentId(), null);
            throw new BusinessRuleException(
                    ErrorCode.PAYMENT_NOT_REQUIRED,
                    "This booking has already been paid for. Refresh to see it confirmed.");
        }
        if (state.open() && state.url() != null) {
            log.debug("Reusing open session {} for booking {}", sessionId, booking.getReference());
            return Optional.of(state.url());
        }

        // Expired or abandoned, and definitely unpaid: a new session is safe. Expiring the old
        // one first means it cannot be paid later from a tab left open.
        checkoutGateway.expireSession(sessionId);
        return Optional.empty();
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

    /**
     * Records that a booking will be paid for at the counter.
     *
     * <p>Written when staff take a booking over the telephone. Until now such a booking had no
     * payment row at all, which made "confirmed and unpaid" indistinguishable from "confirmed and
     * paid" — staff had nothing to work from when the customer arrived.
     *
     * <p>Status is {@code REQUIRES_PAYMENT} and provider {@code COUNTER}: money is expected but
     * not yet taken. {@link #startCheckout} cannot pick this row up, because it refuses any
     * booking that is not {@code PENDING_PAYMENT} and a telephone booking is created CONFIRMED.
     */
    @Transactional
    public Payment recordCounterPayment(Booking booking) {
        return paymentRepository.save(new Payment(
                booking.getId(),
                PaymentStatus.REQUIRES_PAYMENT,
                booking.getPricePence(),
                COUNTER_PROVIDER));
    }

    /**
     * Settles a counter payment: the customer paid on arrival, or the club comped it.
     *
     * <p>Idempotent by refusal rather than by silence. Marking an already-settled booking as paid
     * a second time is far more likely to be a mistake — the wrong booking, or a double click —
     * than a genuine retry, and a silent no-op would tell staff the money was taken twice when it
     * was taken once.
     *
     * @param status must be {@code PAID_AT_COUNTER} or {@code WAIVED}
     * @param staffUserId who keyed it in, kept for the audit trail
     */
    @Transactional
    public Payment settleAtCounter(Booking booking, PaymentStatus status, long staffUserId) {
        if (status != PaymentStatus.PAID_AT_COUNTER && status != PaymentStatus.WAIVED) {
            // Guards the endpoint against being used to fake a Stripe outcome. SUCCEEDED must
            // only ever be written by a confirmed Stripe event, never by a member of staff.
            throw new BusinessRuleException(
                    ErrorCode.VALIDATION_FAILED,
                    "A counter payment can only be recorded as paid or waived.");
        }

        List<Payment> attempts = paymentRepository.findByBookingIdOrderByIdDesc(booking.getId());
        if (attempts.stream().anyMatch(payment -> payment.getStatus().isSettled())) {
            throw new BusinessRuleException(
                    ErrorCode.PAYMENT_NOT_REQUIRED, "This booking has already been paid for.");
        }

        // Reuse the row created when the booking was taken. A second row would leave the
        // outstanding amount ambiguous — two unsettled attempts for one debt.
        Payment payment = attempts.stream()
                .filter(attempt -> COUNTER_PROVIDER.equals(attempt.getProvider()))
                .findFirst()
                .orElseGet(() -> new Payment(
                        booking.getId(),
                        PaymentStatus.REQUIRES_PAYMENT,
                        booking.getPricePence(),
                        COUNTER_PROVIDER));

        payment.setStatus(status);
        payment.setRecordedByUserId(staffUserId);
        log.info(
                "Booking {} settled at the counter as {} by user {}",
                booking.getReference(),
                status,
                staffUserId);
        return paymentRepository.save(payment);
    }

    /**
     * The money state of one booking.
     *
     * <p>Shared with {@link #summariseAll} so the detail page and the list cannot disagree about
     * which of several attempts speaks for a booking.
     */
    @Transactional(readOnly = true)
    public PaymentSummary summarise(Booking booking) {
        return PaymentSummary.of(
                paymentRepository.findByBookingIdOrderByIdDesc(booking.getId()),
                booking.getPricePence());
    }

    /**
     * The money state of many bookings, in one query.
     *
     * <p>The admin list renders payment state per row, so calling {@link #summarise} in the
     * mapping loop would issue a query per booking. Bookings with no payment row are absent from
     * the map; callers treat a miss as {@link PaymentSummary#NONE}.
     */
    @Transactional(readOnly = true)
    public Map<Long, PaymentSummary> summariseAll(Collection<Booking> bookings) {
        if (bookings.isEmpty()) {
            return Map.of();
        }

        Map<Long, Integer> priceByBooking = bookings.stream()
                .collect(Collectors.toMap(Booking::getId, Booking::getPricePence, (a, b) -> a));

        return paymentRepository.findByBookingIdInOrderByIdDesc(priceByBooking.keySet()).stream()
                .collect(Collectors.groupingBy(Payment::getBookingId))
                .entrySet()
                .stream()
                .collect(Collectors.toMap(
                        Map.Entry::getKey,
                        entry -> PaymentSummary.of(
                                entry.getValue(), priceByBooking.get(entry.getKey()))));
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

    /**
     * Flags a settled payment for staff after its booking was cancelled.
     *
     * <p>Deliberately does <em>not</em> call Stripe. Refunding is a decision the club makes,
     * not one this code makes on its behalf: the club may owe nothing (a late cancellation), may
     * owe part of it (a cancellation fee), or may prefer to offer a credit. An automatic refund
     * would pre-empt all three and is close to impossible to undo, whereas a flagged row costs a
     * staff member one click.
     *
     * <p>Returns quietly when nothing was actually paid — cancelling an unpaid hold is the
     * common case and must not raise work for anybody.
     *
     * @return true if a refund now needs a human decision
     */
    @Transactional
    public boolean flagForRefundIfPaid(Booking booking) {
        Optional<Payment> settled = paymentRepository.findByBookingIdOrderByIdDesc(booking.getId())
                .stream()
                .filter(payment -> payment.getStatus().isSettled())
                .findFirst();

        if (settled.isEmpty()) {
            return false;
        }

        Payment payment = settled.get();
        paymentExceptionRepository.save(new PaymentException(
                booking.getId(),
                payment.getId(),
                "Booking cancelled after payment was taken. Refund decision required."));
        log.info(
                "Booking {} cancelled with a settled payment; raised for staff refund decision",
                booking.getReference());
        return true;
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

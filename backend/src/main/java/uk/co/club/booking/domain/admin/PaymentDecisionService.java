package uk.co.club.booking.domain.admin;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uk.co.club.booking.common.error.BusinessRuleException;
import uk.co.club.booking.common.error.ErrorCode;
import uk.co.club.booking.common.error.NotFoundException;
import uk.co.club.booking.common.time.ClubClock;
import uk.co.club.booking.domain.admin.web.dto.PaymentDecisionResponse;
import uk.co.club.booking.domain.booking.Booking;
import uk.co.club.booking.domain.booking.BookingRepository;
import uk.co.club.booking.domain.payment.CheckoutGateway;
import uk.co.club.booking.domain.payment.Payment;
import uk.co.club.booking.domain.payment.PaymentException;
import uk.co.club.booking.domain.payment.PaymentExceptionRepository;
import uk.co.club.booking.domain.payment.PaymentRepository;
import uk.co.club.booking.domain.payment.PaymentStatus;

/**
 * The queue of money questions nobody has answered yet.
 *
 * <p>These rows have always been raised — by a payment that arrived after its slot was gone, and
 * by a cancellation whose refund needs a judgement — and the dashboard has always counted them.
 * Nothing could ever read or clear one: {@code PaymentException.resolve} had no caller anywhere
 * in the application, so the count could only grow, and it named no booking, so staff could not
 * even see which customers were waiting.
 *
 * <p>Reads live here rather than in {@code AdminBookingService} because they join payments to
 * bookings from the payment side, which is the opposite direction to everything that service
 * does.
 */
@Service
public class PaymentDecisionService {

    private static final Logger log = LoggerFactory.getLogger(PaymentDecisionService.class);

    private final PaymentExceptionRepository exceptionRepository;
    private final PaymentRepository paymentRepository;
    private final BookingRepository bookingRepository;
    private final CheckoutGateway checkoutGateway;
    private final ClubClock clubClock;

    public PaymentDecisionService(
            PaymentExceptionRepository exceptionRepository,
            PaymentRepository paymentRepository,
            BookingRepository bookingRepository,
            CheckoutGateway checkoutGateway,
            ClubClock clubClock) {
        this.exceptionRepository = exceptionRepository;
        this.paymentRepository = paymentRepository;
        this.bookingRepository = bookingRepository;
        this.checkoutGateway = checkoutGateway;
        this.clubClock = clubClock;
    }

    /** Everything still waiting on a person, oldest first. */
    @Transactional(readOnly = true)
    public List<PaymentDecisionResponse> unresolved() {
        List<PaymentException> exceptions =
                exceptionRepository.findByResolvedAtIsNullOrderByCreatedAtAsc();
        if (exceptions.isEmpty()) {
            return List.of();
        }

        // Three queries whatever the size of the queue, rather than two per row.
        Map<Long, Payment> payments = paymentRepository
                .findAllById(exceptions.stream().map(PaymentException::getPaymentId).toList())
                .stream()
                .collect(Collectors.toMap(Payment::getId, Function.identity()));
        Map<Long, Booking> bookings = bookingRepository
                .findAllByIdWithTable(
                        exceptions.stream().map(PaymentException::getBookingId).toList())
                .stream()
                .collect(Collectors.toMap(Booking::getId, Function.identity()));

        return exceptions.stream()
                .map(exception -> toResponse(
                        exception,
                        payments.get(exception.getPaymentId()),
                        bookings.get(exception.getBookingId())))
                .filter(Optional::isPresent)
                .map(Optional::get)
                .toList();
    }

    /**
     * Marks a decision as made, without moving any money.
     *
     * <p>For the cases settled away from this screen: cash handed back over the counter, a
     * refund a manager issued in the Stripe dashboard, or a decision that the club owes nothing.
     *
     * @param actingUserId stamped from the session, never the request body
     */
    @Transactional
    public void resolve(long id, long actingUserId) {
        PaymentException exception = require(id);
        exception.resolve(clubClock.now(), actingUserId);
        log.info("Payment decision {} resolved by user {}", id, actingUserId);
    }

    /**
     * Sends the money back, then closes the decision.
     *
     * <p>Refunds the full amount: this queue exists for bookings the customer did not get, and
     * a part refund there is a negotiation rather than a button. The row stays open if the
     * provider does not confirm — a decision marked done on a refund that never happened is
     * exactly the failure this queue exists to prevent.
     */
    @Transactional
    public void refund(long id, long actingUserId) {
        PaymentException exception = require(id);
        Payment payment = paymentRepository
                .findById(exception.getPaymentId())
                .orElseThrow(() -> new NotFoundException(
                        ErrorCode.NOT_FOUND, "That payment no longer exists."));
        Booking booking = bookingRepository
                .findById(exception.getBookingId())
                .orElseThrow(() -> new NotFoundException(
                        ErrorCode.NOT_FOUND, "That booking no longer exists."));

        if (payment.getStatus() != PaymentStatus.SUCCEEDED
                || payment.getStripePaymentIntentId() == null) {
            // Counter cash and waived bookings reach this queue too, and there is nothing to
            // send back through the provider. Refusing is better than a no-op that looks like
            // a refund: staff would believe a customer had been repaid.
            throw new BusinessRuleException(
                    ErrorCode.PAYMENT_NOT_REFUNDABLE,
                    "This payment was not taken by card, so it cannot be refunded here. "
                            + "Settle it with the customer and mark it resolved.");
        }

        Optional<CheckoutGateway.RefundResult> refunded = checkoutGateway.refund(
                payment.getStripePaymentIntentId(),
                payment.getAmountPence(),
                // The reference again, so this cannot double-refund a booking the automatic
                // path already sent money back for.
                booking.getReference());

        if (refunded.isEmpty()) {
            throw new BusinessRuleException(
                    ErrorCode.PAYMENT_PROVIDER_ERROR,
                    "The refund could not be completed. Nothing has been changed — "
                            + "please try again, or refund it in Stripe and mark it resolved.");
        }

        payment.setStatus(
                refunded.get().amountRefundedPence() >= payment.getAmountPence()
                        ? PaymentStatus.REFUNDED
                        : PaymentStatus.PARTIALLY_REFUNDED);
        paymentRepository.save(payment);
        exception.resolve(clubClock.now(), actingUserId);

        log.info(
                "Payment decision {} refunded {}p by user {} ({})",
                id,
                refunded.get().amountRefundedPence(),
                actingUserId,
                refunded.get().refundId());
    }

    private PaymentException require(long id) {
        PaymentException exception = exceptionRepository
                .findById(id)
                .orElseThrow(() -> new NotFoundException(
                        ErrorCode.NOT_FOUND, "That payment decision does not exist."));
        if (exception.getResolvedAt() != null) {
            // Refused rather than ignored, for the same reason settling a counter payment twice
            // is: a double click is likelier than a genuine retry, and a quiet success would
            // tell staff they had refunded someone twice.
            throw new BusinessRuleException(
                    ErrorCode.PAYMENT_ALREADY_SETTLED,
                    "That payment has already been dealt with.");
        }
        return exception;
    }

    /**
     * Empty when the booking or payment behind a row has gone.
     *
     * <p>Not expected — nothing deletes either — but a queue that throws on one bad row would
     * hide every good one behind it, and this screen is where staff go when money is unaccounted
     * for.
     */
    private Optional<PaymentDecisionResponse> toResponse(
            PaymentException exception, Payment payment, Booking booking) {
        if (payment == null || booking == null) {
            log.warn(
                    "Payment decision {} refers to a missing booking or payment; skipping",
                    exception.getId());
            return Optional.empty();
        }
        return Optional.of(new PaymentDecisionResponse(
                exception.getId(),
                booking.getReference(),
                booking.getSnookerTable().getName(),
                clubClock.toLocalDate(booking.getStartAt()),
                clubClock.toLocalTime(booking.getStartAt()),
                clubClock.toLocalTime(booking.getEndAt()),
                booking.getCustomerName(),
                booking.getCustomerEmail(),
                booking.getCustomerPhone(),
                payment.getAmountPence(),
                payment.getStatus(),
                payment.getStatus() == PaymentStatus.SUCCEEDED
                        && payment.getStripePaymentIntentId() != null,
                exception.getReason(),
                exception.getCreatedAt()));
    }
}

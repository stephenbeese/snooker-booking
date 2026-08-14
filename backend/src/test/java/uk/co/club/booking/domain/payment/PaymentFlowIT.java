package uk.co.club.booking.domain.payment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import uk.co.club.booking.common.error.BusinessRuleException;
import uk.co.club.booking.common.error.ErrorCode;
import uk.co.club.booking.common.time.ClubClock;
import uk.co.club.booking.domain.booking.Booking;
import uk.co.club.booking.domain.booking.BookingPolicy;
import uk.co.club.booking.domain.booking.BookingRepository;
import uk.co.club.booking.domain.booking.BookingService;
import uk.co.club.booking.domain.booking.BookingSource;
import uk.co.club.booking.domain.booking.BookingStatus;
import uk.co.club.booking.domain.booking.CreateBookingCommand;
import uk.co.club.booking.domain.booking.HoldSweeper;
import uk.co.club.booking.support.AbstractIntegrationTest;
import uk.co.club.booking.support.IntegrationFixtures;
import uk.co.club.booking.support.StubCheckoutGateway;

/**
 * The payment lifecycle against a real database.
 *
 * <p>Covers the parts that unit tests cannot: that a hold genuinely reserves the slot, that
 * confirmation is idempotent across the two uncoordinated paths, and that expiry releases the
 * slot for resale.
 */
@Import(StubCheckoutGateway.Config.class)
class PaymentFlowIT extends AbstractIntegrationTest {

    @Autowired private BookingService bookingService;
    @Autowired private BookingRepository bookingRepository;
    @Autowired private PaymentService paymentService;
    @Autowired private PaymentRepository paymentRepository;
    @Autowired private PaymentExceptionRepository paymentExceptionRepository;
    @Autowired private HoldSweeper holdSweeper;
    @Autowired private StubCheckoutGateway gateway;
    @Autowired private IntegrationFixtures fixtures;
    @Autowired private ClubClock clubClock;

    private long tableId;

    @BeforeEach
    void setUpFixtures() {
        gateway.reset();
        tableId = fixtures.aTable("Table 1");
    }

    @Test
    @DisplayName("a new online booking holds its slot and returns a checkout URL")
    void createsHoldAndCheckoutSession() {
        Booking booking = createOnlineBooking(LocalTime.of(19, 0));

        assertThat(booking.getStatus()).isEqualTo(BookingStatus.PENDING_PAYMENT);
        // The hold must have an expiry: a CHECK constraint requires one for PENDING_PAYMENT,
        // and without it the sweeper could never release the slot.
        assertThat(booking.getHoldExpiresAt()).isNotNull();
        assertThat(booking.getPricePence()).isEqualTo(1200);

        String url = paymentService.startCheckout(booking);

        assertThat(url).startsWith("https://checkout.stripe.test/");
        assertThat(gateway.created()).hasSize(1);
        // Amount comes from the persisted booking, not from anything a client sent.
        assertThat(gateway.created().getFirst().amountPence()).isEqualTo(1200);
        assertThat(gateway.created().getFirst().bookingReference()).isEqualTo(booking.getReference());
    }

    @Test
    @DisplayName("a hold blocks the slot before any money has changed hands")
    void holdReservesTheSlotImmediately() {
        Booking held = createOnlineBooking(LocalTime.of(19, 0));

        // The whole point of holding first: nobody else can take this slot while the customer
        // is on the Stripe page.
        assertThat(held.getStatus()).isEqualTo(BookingStatus.PENDING_PAYMENT);
        org.assertj.core.api.Assertions.assertThatThrownBy(
                        () -> createOnlineBooking(LocalTime.of(19, 0)))
                .isInstanceOf(RuntimeException.class);
    }

    @Test
    @DisplayName("payment confirms the booking")
    void paymentConfirmsBooking() {
        Booking booking = createOnlineBooking(LocalTime.of(19, 0));
        paymentService.startCheckout(booking);
        String sessionId = latestSessionId(booking.getId());

        paymentService.markPaid(sessionId, latestPaymentIntentId(booking.getId()), "ch_test_1");

        assertThat(fixtures.statusOf(booking.getId())).isEqualTo("CONFIRMED");
        assertThat(paymentRepository.findByStripeCheckoutSessionId(sessionId))
                .get()
                .extracting(Payment::getStatus)
                .isEqualTo(PaymentStatus.SUCCEEDED);
    }

    @Test
    @DisplayName("confirming twice is a no-op, not a double confirmation")
    void confirmationIsIdempotent() {
        Booking booking = createOnlineBooking(LocalTime.of(19, 0));
        paymentService.startCheckout(booking);
        String sessionId = latestSessionId(booking.getId());

        // The webhook and the browser return arrive in an unpredictable order, and both call
        // this. The second must change nothing rather than, say, creating a second payment.
        paymentService.markPaid(sessionId, latestPaymentIntentId(booking.getId()), "ch_test_1");
        paymentService.markPaid(sessionId, latestPaymentIntentId(booking.getId()), "ch_test_1");

        assertThat(fixtures.statusOf(booking.getId())).isEqualTo("CONFIRMED");
        assertThat(paymentRepository.findByBookingIdOrderByIdDesc(booking.getId())).hasSize(1);
    }

    @Test
    @DisplayName("the hold expiry is cleared on confirmation, as the CHECK constraint requires")
    void confirmationClearsTheHoldExpiry() {
        Booking booking = createOnlineBooking(LocalTime.of(19, 0));
        paymentService.startCheckout(booking);

        paymentService.markPaid(
                latestSessionId(booking.getId()), latestPaymentIntentId(booking.getId()), null);

        // booking_hold_expiry_iff_pending would have rejected the update otherwise, so this
        // asserts the constraint is satisfied rather than merely that the field looks tidy.
        Booking confirmed = bookingRepository.findById(booking.getId()).orElseThrow();
        assertThat(confirmed.getHoldExpiresAt()).isNull();
    }

    @Test
    @DisplayName("the sweeper releases a lapsed hold and frees the slot for resale")
    void sweeperReleasesLapsedHold() {
        Instant start = clubTime(LocalTime.of(19, 0));
        // Written straight to the database with an expiry already in the past: the service
        // would refuse to create a booking in this state, which is exactly why it is a fixture.
        long staleId = fixtures.aBooking(
                "SNK-STALE1",
                tableId,
                start,
                60,
                "PENDING_PAYMENT",
                null,
                clubClock.now().minus(Duration.ofMinutes(5)));

        holdSweeper.sweep();

        assertThat(fixtures.statusOf(staleId)).isEqualTo("EXPIRED");

        // The real test: the slot is genuinely available again, not merely relabelled.
        Booking rebooked = createOnlineBooking(LocalTime.of(19, 0));
        assertThat(rebooked.getStatus()).isEqualTo(BookingStatus.PENDING_PAYMENT);
    }

    @Test
    @DisplayName("the sweeper leaves a live hold alone")
    void sweeperIgnoresLiveHold() {
        Booking booking = createOnlineBooking(LocalTime.of(19, 0));

        holdSweeper.sweep();

        // Expiring a hold that is still within its TTL would cancel a customer mid-checkout.
        assertThat(fixtures.statusOf(booking.getId())).isEqualTo("PENDING_PAYMENT");
    }

    @Test
    @DisplayName("the sweeper expires the Stripe session when it releases a hold")
    void sweeperCancelsTheCheckoutSession() {
        Booking booking = createOnlineBooking(LocalTime.of(19, 0));
        paymentService.startCheckout(booking);
        String sessionId = latestSessionId(booking.getId());
        expireHoldOf(booking.getId());

        holdSweeper.sweep();

        // Without this, a customer could pay for a slot the club has already put back on sale.
        assertThat(gateway.expiredSessions()).contains(sessionId);
    }

    @Test
    @DisplayName("sweeping twice releases nothing extra")
    void sweepingIsIdempotent() {
        Booking booking = createOnlineBooking(LocalTime.of(19, 0));
        expireHoldOf(booking.getId());

        holdSweeper.sweep();
        holdSweeper.sweep();

        assertThat(fixtures.statusOf(booking.getId())).isEqualTo("EXPIRED");
    }

    @Test
    @DisplayName("a late payment reinstates the booking when the slot is still free")
    void latePaymentReinstatesWhenSlotIsFree() {
        Booking booking = createOnlineBooking(LocalTime.of(19, 0));
        paymentService.startCheckout(booking);
        String sessionId = latestSessionId(booking.getId());
        expireHoldOf(booking.getId());
        holdSweeper.sweep();
        assertThat(fixtures.statusOf(booking.getId())).isEqualTo("EXPIRED");

        // Stripe's minimum session expiry (30 min) outlives the hold (15 min), so this is a
        // real sequence, not a contrived one.
        paymentService.markPaid(sessionId, latestPaymentIntentId(booking.getId()), "ch_test_1");

        assertThat(fixtures.statusOf(booking.getId())).isEqualTo("CONFIRMED");
        assertThat(paymentExceptionRepository.findByResolvedAtIsNullOrderByCreatedAtAsc()).isEmpty();
    }

    @Test
    @DisplayName("a late payment for a resold slot is raised for staff, and the money is kept")
    void latePaymentForResoldSlotRaisesAnException() {
        Booking booking = createOnlineBooking(LocalTime.of(19, 0));
        paymentService.startCheckout(booking);
        String sessionId = latestSessionId(booking.getId());
        expireHoldOf(booking.getId());
        holdSweeper.sweep();

        // Somebody else takes the slot in the meantime.
        Booking replacement = createOnlineBooking(LocalTime.of(19, 0));
        assertThat(replacement.getId()).isNotEqualTo(booking.getId());

        paymentService.markPaid(sessionId, latestPaymentIntentId(booking.getId()), "ch_test_1");

        // The original cannot be reinstated without evicting somebody who booked in good faith.
        assertThat(fixtures.statusOf(booking.getId())).isEqualTo("EXPIRED");
        // The payment stays SUCCEEDED — auto-refunding would hide a problem staff must see.
        assertThat(paymentRepository.findByStripeCheckoutSessionId(sessionId))
                .get()
                .extracting(Payment::getStatus)
                .isEqualTo(PaymentStatus.SUCCEEDED);
        assertThat(paymentExceptionRepository.findByResolvedAtIsNullOrderByCreatedAtAsc())
                .hasSize(1);
    }

    @Test
    @DisplayName("a failed payment keeps the hold so the customer can retry")
    void failedPaymentKeepsTheHold() {
        Booking booking = createOnlineBooking(LocalTime.of(19, 0));
        paymentService.startCheckout(booking);
        // Read back rather than hardcoding "pi_test_1": the stub's counter is per-instance and
        // does not reset between tests, so the literal is only right for whichever test runs
        // first — a classic order-dependent failure.
        String paymentIntentId = latestPaymentIntentId(booking.getId());

        paymentService.markFailed(paymentIntentId, "card_declined", "Your card was declined.");

        // Cancelling the booking on a declined card would lose the sale to a customer who
        // simply needs to try a different card.
        assertThat(fixtures.statusOf(booking.getId())).isEqualTo("PENDING_PAYMENT");
        assertThat(paymentRepository.findByStripePaymentIntentId(paymentIntentId))
                .get()
                .extracting(Payment::getStatus)
                .isEqualTo(PaymentStatus.FAILED);
    }

    @Test
    @DisplayName("retrying after a decline creates a new session with a different idempotency key")
    void retryUsesAFreshIdempotencyKey() {
        Booking booking = createOnlineBooking(LocalTime.of(19, 0));
        paymentService.startCheckout(booking);
        paymentService.markFailed(
                latestPaymentIntentId(booking.getId()), "card_declined", "Declined");

        paymentService.startCheckout(booking);

        // Reusing the key would return the original, already-failed session and the customer
        // could never complete the payment.
        assertThat(gateway.idempotencyKeys()).hasSize(2);
        assertThat(gateway.idempotencyKeys().get(0)).isNotEqualTo(gateway.idempotencyKeys().get(1));
    }

    @Test
    @DisplayName("a booking can be read outside a transaction, table name included")
    void bookingIsUsableAfterItsTransactionCloses() {
        Booking created = createOnlineBooking(LocalTime.of(19, 0));

        // Reading the table name is what the controller does when it builds the DTO, and it is
        // the exact operation that threw LazyInitializationException in the browser while every
        // test still passed: the tests ran inside a transaction, so the lazy proxy was alive.
        // These lookups go through the service, which must fetch the table eagerly.
        Booking byReference = bookingService.requireByReference(created.getReference());
        assertThat(byReference.getSnookerTable().getName()).isEqualTo("Table 1");

        assertThat(bookingService.forUser(created.getUserId() == null ? 0L : created.getUserId()))
                .allSatisfy(booking ->
                        assertThat(booking.getSnookerTable().getName()).isNotBlank());
    }

    @Test
    @DisplayName("a staff booking is confirmed immediately with no payment hold")
    void staffBookingSkipsThePaymentHold() {
        Booking booking = bookingService.create(
                command(clubTime(LocalTime.of(19, 0)), 60, BookingSource.TELEPHONE),
                BookingPolicy.staff());

        // No hold, because a member of staff is present — there is nothing to reserve against.
        assertThat(booking.getStatus()).isEqualTo(BookingStatus.CONFIRMED);
        assertThat(booking.getHoldExpiresAt()).isNull();
        assertThat(gateway.created()).isEmpty();
    }

    // ------------------------------------------------------------------ helpers

    private Booking createOnlineBooking(LocalTime time) {
        return bookingService.create(
                command(clubTime(time), 60, BookingSource.ONLINE), BookingPolicy.online());
    }

    private CreateBookingCommand command(Instant startAt, int minutes, BookingSource source) {
        return new CreateBookingCommand(
                tableId,
                startAt,
                minutes,
                null,
                "Test Customer",
                "test@example.test",
                null,
                null,
                source,
                null);
    }

    // ------------------------------------------------------- the double-charge guard

    @Test
    @DisplayName("a paid booking whose webhook never arrived is confirmed, not charged again")
    void reconcilesInsteadOfChargingTwice() {
        // The real incident this guards: the customer paid, the webhook was never delivered
        // (no forwarder running), the booking stayed PENDING_PAYMENT, the page offered "Pay
        // now", and a second genuine charge was taken for the same slot.
        Booking booking = createOnlineBooking(LocalTime.of(19, 0));
        paymentService.startCheckout(booking);
        String firstSession = latestSessionId(booking.getId());

        // Money taken at Stripe; the application is told nothing.
        gateway.markPaidAtProviderOnly(firstSession);

        assertThatThrownBy(() -> paymentService.startCheckout(booking))
                .isInstanceOf(BusinessRuleException.class)
                .satisfies(thrown -> assertThat(((BusinessRuleException) thrown).getCode())
                        .isEqualTo(ErrorCode.PAYMENT_NOT_REQUIRED));

        // The decisive assertion: exactly one session was ever created. A second would be a
        // second payable checkout, which is the bug.
        assertThat(gateway.created()).hasSize(1);

        // And the refusal is not merely a refusal — it repaired the booking from Stripe's
        // answer, so the customer sees it confirmed rather than stuck.
        Booking reloaded = bookingRepository.findById(booking.getId()).orElseThrow();
        assertThat(reloaded.getStatus()).isEqualTo(BookingStatus.CONFIRMED);
        assertThat(paymentRepository.findByBookingIdOrderByIdDesc(booking.getId()))
                .extracting(Payment::getStatus)
                .containsExactly(PaymentStatus.SUCCEEDED);
    }

    @Test
    @DisplayName("clicking pay twice reuses the open session rather than creating a second")
    void reusesAnOpenSession() {
        // The impatient double-click, or a reload of the booking page. Both sessions would be
        // payable, so the customer can end up paying each of them.
        Booking booking = createOnlineBooking(LocalTime.of(19, 0));

        String first = paymentService.startCheckout(booking);
        String second = paymentService.startCheckout(booking);

        assertThat(second).isEqualTo(first);
        assertThat(gateway.created()).hasSize(1);
    }

    @Test
    @DisplayName("a declined card still gets a fresh session, so another card can be tried")
    void allowsRetryAfterDecline() {
        // The guard must not overreach: a genuinely failed payment is the case retrying exists
        // for, and the old session cannot be paid.
        Booking booking = createOnlineBooking(LocalTime.of(19, 0));
        paymentService.startCheckout(booking);

        // Keyed on the payment intent, which is what the payment_intent.payment_failed webhook
        // carries — not on the session id.
        paymentService.markFailed(
                latestPaymentIntentId(booking.getId()), "card_declined", "Your card was declined.");

        String retryUrl = paymentService.startCheckout(booking);

        assertThat(gateway.created()).hasSize(2);
        assertThat(retryUrl).isNotBlank();
    }

    @Test
    @DisplayName("an unreachable Stripe refuses the checkout rather than risking a second charge")
    void refusesWhenTheProviderCannotBeAsked() {
        // "Could not find out" must never be treated as "not paid". Creating a session here is
        // exactly how the customer is charged twice, so the honest answer is to refuse and let
        // them try again in a moment — the hold survives either way.
        Booking booking = createOnlineBooking(LocalTime.of(19, 0));
        paymentService.startCheckout(booking);
        gateway.makeFetchUnavailable();

        assertThatThrownBy(() -> paymentService.startCheckout(booking))
                .isInstanceOf(BusinessRuleException.class)
                .satisfies(thrown -> assertThat(((BusinessRuleException) thrown).getCode())
                        .isEqualTo(ErrorCode.PAYMENT_PROVIDER_ERROR));

        assertThat(gateway.created()).hasSize(1);
    }

    @Test
    @DisplayName("a lapsed session is replaced, and expired again so it cannot be paid later")
    void replacesAnExpiredSession() {
        Booking booking = createOnlineBooking(LocalTime.of(19, 0));
        paymentService.startCheckout(booking);
        String firstSession = latestSessionId(booking.getId());

        // Neither open nor paid: the customer wandered off and the session lapsed at Stripe.
        gateway.lapseSession(firstSession);

        paymentService.startCheckout(booking);

        assertThat(gateway.created()).hasSize(2);
        // Counted from zero, because lapseSession above deliberately does NOT record an expiry.
        // Asserting merely that the id appears in the list would pass without the guard at all,
        // since the test's own setup would have put it there — which is exactly what the first
        // version of this test did, and it survived deleting the code it was written to protect.
        assertThat(gateway.expiredSessions()).containsExactly(firstSession);
    }

    /** Drags a hold's expiry into the past so the sweeper will pick it up. */
    private void expireHoldOf(long bookingId) {
        jdbcTemplate.update(
                "UPDATE booking SET hold_expires_at = now() - interval '1 minute' WHERE id = ?",
                bookingId);
    }

    private String latestPaymentIntentId(long bookingId) {
        return paymentRepository.findByBookingIdOrderByIdDesc(bookingId).stream()
                .map(Payment::getStripePaymentIntentId)
                .filter(java.util.Objects::nonNull)
                .findFirst()
                .orElseThrow(() -> new AssertionError("No payment intent recorded"));
    }

    private String latestSessionId(long bookingId) {
        return paymentRepository.findByBookingIdOrderByIdDesc(bookingId).stream()
                .map(Payment::getStripeCheckoutSessionId)
                .filter(java.util.Objects::nonNull)
                .findFirst()
                .orElseThrow(() -> new AssertionError("No checkout session recorded"));
    }

    /** Tomorrow (never a Sunday, which closes at 20:00) at the given club-local time. */
    private Instant clubTime(LocalTime time) {
        LocalDate date = clubClock.today().plusDays(1);
        if (date.getDayOfWeek() == java.time.DayOfWeek.SUNDAY) {
            date = date.plusDays(1);
        }
        return clubClock.toInstant(date, time);
    }
}

package uk.co.club.booking.domain.booking;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import uk.co.club.booking.common.error.BusinessRuleException;
import uk.co.club.booking.common.error.ErrorCode;
import uk.co.club.booking.common.error.NotFoundException;
import uk.co.club.booking.common.time.ClubClock;
import uk.co.club.booking.domain.payment.PaymentExceptionRepository;
import uk.co.club.booking.domain.payment.PaymentService;
import uk.co.club.booking.support.AbstractIntegrationTest;
import uk.co.club.booking.support.IntegrationFixtures;
import uk.co.club.booking.support.StubCheckoutGateway;

/**
 * Cancellation, against real PostgreSQL. The Phase 3 hard gate.
 *
 * <p>The decisive test is {@link #cancellingFreesTheSlotForSomebodyElse()}. Everything else here
 * checks that the rules are applied; that one checks the thing the rules exist to make possible
 * — that a cancelled row genuinely stops occupying its slot. It matters because the release is
 * not performed by any application code: it is a consequence of {@code booking_no_overlap} being
 * a <em>partial</em> index whose predicate excludes CANCELLED. If that predicate and
 * {@link BookingStatus#slotOccupying()} ever drift apart, cancellation silently stops freeing
 * anything, availability keeps showing the slot as taken, and no unit test would notice.
 */
@Import(StubCheckoutGateway.Config.class)
class CancellationIT extends AbstractIntegrationTest {

    @Autowired private BookingService bookingService;
    @Autowired private CancellationPolicy cancellationPolicy;
    @Autowired private PaymentService paymentService;
    @Autowired private PaymentExceptionRepository paymentExceptionRepository;
    @Autowired private IntegrationFixtures fixtures;
    @Autowired private ClubClock clubClock;

    @Test
    @DisplayName("a customer may cancel their own confirmed booking well before it starts")
    void cancelsWithNotice() {
        fixtures.cancellationNoticeHours(24);
        long tableId = fixtures.aTable("Table 1");
        long userId = fixtures.aCustomer("cancel-me@test.local", "Password123!");
        // Three days out, comfortably outside a 24-hour notice period.
        long bookingId = fixtures.aBooking(
                "SNK-CANC01", tableId, daysAheadAt(3, LocalTime.of(19, 0)), 60,
                "CONFIRMED", userId, null);

        boolean cancelled = bookingService.cancel(
                bookingService.requireById(bookingId), userId, false, "Change of plan");

        assertThat(cancelled).isTrue();
        assertThat(fixtures.statusOf(bookingId)).isEqualTo("CANCELLED");
    }

    @Test
    @DisplayName("cancelling frees the slot, and somebody else can immediately book it")
    void cancellingFreesTheSlotForSomebodyElse() {
        fixtures.cancellationNoticeHours(24);
        long tableId = fixtures.aTable("Table 1");
        long firstUser = fixtures.aCustomer("first@test.local", "Password123!");
        long secondUser = fixtures.aCustomer("second@test.local", "Password123!");
        Instant start = daysAheadAt(3, LocalTime.of(19, 0));

        long bookingId = fixtures.aBooking(
                "SNK-CANC02", tableId, start, 60, "CONFIRMED", firstUser, null);

        // Before cancellation the slot is genuinely taken — otherwise the assertion after the
        // cancellation would prove nothing.
        //
        // BusinessRuleException, not SlotTakenException: with no concurrent writer the
        // validator's overlap pre-check rejects this first and produces the friendlier message.
        // SlotTakenException is what the database constraint raises when two writers actually
        // race, which BookingConcurrencyIT covers.
        assertThatThrownBy(() -> book(tableId, start, secondUser))
                .isInstanceOf(BusinessRuleException.class)
                .hasMessageContaining("just been taken");

        bookingService.cancel(bookingService.requireById(bookingId), firstUser, false, null);

        assertThatCode(() -> book(tableId, start, secondUser)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("a customer may not cancel inside the notice period")
    void rejectsCancellationInsideNoticePeriod() {
        fixtures.cancellationNoticeHours(24);
        long tableId = fixtures.aTable("Table 1");
        long userId = fixtures.aCustomer("too-late@test.local", "Password123!");
        // Two hours away, well inside a 24-hour notice period.
        long bookingId = fixtures.aBooking(
                "SNK-CANC03", tableId, clubClock.now().plus(Duration.ofHours(2)), 60,
                "CONFIRMED", userId, null);

        assertThatThrownBy(() ->
                        bookingService.cancel(
                                bookingService.requireById(bookingId), userId, false, null))
                .isInstanceOf(BusinessRuleException.class)
                .extracting(ex -> ((BusinessRuleException) ex).getCode())
                .isEqualTo(ErrorCode.CANCELLATION_TOO_LATE);

        assertThat(fixtures.statusOf(bookingId)).isEqualTo("CONFIRMED");
    }

    @Test
    @DisplayName("an admin may cancel inside the notice period")
    void adminBypassesNoticePeriod() {
        fixtures.cancellationNoticeHours(24);
        long tableId = fixtures.aTable("Table 1");
        long customerId = fixtures.aCustomer("customer@test.local", "Password123!");
        long adminId = fixtures.anAdmin("admin@test.local", "Password123!");
        long bookingId = fixtures.aBooking(
                "SNK-CANC04", tableId, clubClock.now().plus(Duration.ofHours(2)), 60,
                "CONFIRMED", customerId, null);

        boolean cancelled = bookingService.cancel(
                bookingService.requireById(bookingId), adminId, true, "Table damaged");

        assertThat(cancelled).isTrue();
        assertThat(fixtures.statusOf(bookingId)).isEqualTo("CANCELLED");
    }

    @Test
    @DisplayName("an unpaid hold can always be released, notice period or not")
    void unpaidHoldIsAlwaysCancellable() {
        fixtures.cancellationNoticeHours(24);
        long tableId = fixtures.aTable("Table 1");
        long userId = fixtures.aCustomer("holder@test.local", "Password123!");
        // Inside the notice period, but nothing has been paid and the sweeper would release
        // it within minutes anyway.
        long bookingId = fixtures.aBooking(
                "SNK-CANC05", tableId, clubClock.now().plus(Duration.ofHours(2)), 60,
                "PENDING_PAYMENT", userId, clubClock.now().plus(Duration.ofMinutes(15)));

        boolean cancelled =
                bookingService.cancel(bookingService.requireById(bookingId), userId, false, null);

        assertThat(cancelled).isTrue();
        assertThat(fixtures.statusOf(bookingId)).isEqualTo("CANCELLED");
    }

    @Test
    @DisplayName("cancelling twice is not an error, and does not cancel twice")
    void secondCancellationIsANoOp() {
        fixtures.cancellationNoticeHours(24);
        long tableId = fixtures.aTable("Table 1");
        long userId = fixtures.aCustomer("twice@test.local", "Password123!");
        long bookingId = fixtures.aBooking(
                "SNK-CANC06", tableId, daysAheadAt(3, LocalTime.of(19, 0)), 60,
                "CONFIRMED", userId, null);

        bookingService.cancel(bookingService.requireById(bookingId), userId, false, null);

        // The second attempt is refused by the policy rather than silently succeeding: the
        // booking is already in a terminal state.
        assertThatThrownBy(() ->
                        bookingService.cancel(
                                bookingService.requireById(bookingId), userId, false, null))
                .isInstanceOf(BusinessRuleException.class)
                .extracting(ex -> ((BusinessRuleException) ex).getCode())
                .isEqualTo(ErrorCode.BOOKING_NOT_CANCELLABLE);
    }

    @Test
    @DisplayName("a booking that has already started cannot be cancelled online")
    void rejectsCancellingAStartedBooking() {
        long tableId = fixtures.aTable("Table 1");
        long userId = fixtures.aCustomer("started@test.local", "Password123!");
        long bookingId = fixtures.aBooking(
                "SNK-CANC07", tableId, clubClock.now().minus(Duration.ofMinutes(30)), 60,
                "CONFIRMED", userId, null);

        assertThatThrownBy(() ->
                        bookingService.cancel(
                                bookingService.requireById(bookingId), userId, false, null))
                .isInstanceOf(BusinessRuleException.class)
                .extracting(ex -> ((BusinessRuleException) ex).getCode())
                .isEqualTo(ErrorCode.BOOKING_NOT_CANCELLABLE);
    }

    @Test
    @DisplayName("cancelling somebody else's booking answers 404, not 403")
    void cannotCancelSomebodyElsesBooking() {
        long tableId = fixtures.aTable("Table 1");
        long owner = fixtures.aCustomer("owner@test.local", "Password123!");
        long attacker = fixtures.aCustomer("attacker@test.local", "Password123!");
        long bookingId = fixtures.aBooking(
                "SNK-CANC08", tableId, daysAheadAt(3, LocalTime.of(19, 0)), 60,
                "CONFIRMED", owner, null);

        Booking booking = bookingService.requireById(bookingId);

        // 404, because a 403 would confirm the booking exists and let an attacker enumerate
        // the club's bookings by watching which references answer differently.
        assertThatThrownBy(() -> bookingService.requireOwnership(booking, attacker, false))
                .isInstanceOf(NotFoundException.class);

        assertThat(fixtures.statusOf(bookingId)).isEqualTo("CONFIRMED");
    }

    @Test
    @DisplayName("cancelling a paid booking raises a refund decision for staff")
    void paidCancellationIsFlaggedForStaff() {
        fixtures.cancellationNoticeHours(24);
        long tableId = fixtures.aTable("Table 1");
        long userId = fixtures.aCustomer("paid@test.local", "Password123!");
        Instant start = daysAheadAt(3, LocalTime.of(19, 0));

        // Through the real payment path, so the payment row is exactly what production writes.
        Booking booking = book(tableId, start, userId);
        paymentService.startCheckout(booking);
        paymentService.markPaid(sessionIdOf(booking), null, "ch_test_cancel");

        Booking paid = bookingService.requireById(booking.getId());
        assertThat(paid.getStatus()).isEqualTo(BookingStatus.CONFIRMED);

        bookingService.cancel(paid, userId, false, "Changed my mind");
        boolean flagged = paymentService.flagForRefundIfPaid(paid);

        assertThat(flagged).isTrue();
        assertThat(paymentExceptionRepository.findAll())
                .singleElement()
                .satisfies(exception -> {
                    assertThat(exception.getBookingId()).isEqualTo(booking.getId());
                    assertThat(exception.getReason()).contains("Refund decision required");
                    // Unresolved: it is work for a human, and marking it done here would hide it.
                    assertThat(exception.getResolvedAt()).isNull();
                });
    }

    @Test
    @DisplayName("cancelling an unpaid booking raises nothing for staff")
    void unpaidCancellationRaisesNoWork() {
        fixtures.cancellationNoticeHours(24);
        long tableId = fixtures.aTable("Table 1");
        long userId = fixtures.aCustomer("unpaid@test.local", "Password123!");
        long bookingId = fixtures.aBooking(
                "SNK-CANC09", tableId, daysAheadAt(3, LocalTime.of(19, 0)), 60,
                "PENDING_PAYMENT", userId, clubClock.now().plus(Duration.ofMinutes(15)));

        Booking booking = bookingService.requireById(bookingId);
        bookingService.cancel(booking, userId, false, null);

        assertThat(paymentService.flagForRefundIfPaid(booking)).isFalse();
        assertThat(paymentExceptionRepository.findAll()).isEmpty();
    }

    @Test
    @DisplayName("the published decision matches what cancelling would actually do")
    void decisionAgreesWithBehaviour() {
        fixtures.cancellationNoticeHours(24);
        long tableId = fixtures.aTable("Table 1");
        long userId = fixtures.aCustomer("decision@test.local", "Password123!");

        long inTime = fixtures.aBooking(
                "SNK-CANC10", tableId, daysAheadAt(3, LocalTime.of(19, 0)), 60,
                "CONFIRMED", userId, null);
        long tooLate = fixtures.aBooking(
                "SNK-CANC11", tableId, clubClock.now().plus(Duration.ofHours(2)), 60,
                "CONFIRMED", userId, null);

        // The UI disables its button from exactly this value, so a disagreement here is a
        // button that lies in one direction or the other.
        CancellationPolicy.Decision allowed =
                cancellationPolicy.evaluate(bookingService.requireById(inTime), false);
        CancellationPolicy.Decision denied =
                cancellationPolicy.evaluate(bookingService.requireById(tooLate), false);

        assertThat(allowed.cancellable()).isTrue();
        assertThat(allowed.cancellableUntil()).isNotNull();
        assertThat(denied.cancellable()).isFalse();
        assertThat(denied.reason()).isEqualTo(ErrorCode.CANCELLATION_TOO_LATE);
        assertThat(denied.message()).contains("24 hours");
    }

    private Booking book(long tableId, Instant start, long userId) {
        return bookingService.create(
                new CreateBookingCommand(
                        tableId,
                        start,
                        60,
                        userId,
                        "Test Customer",
                        "test@test.local",
                        null,
                        null,
                        BookingSource.ONLINE,
                        userId),
                BookingPolicy.online());
    }

    private String sessionIdOf(Booking booking) {
        return jdbcTemplate.queryForObject(
                "SELECT stripe_checkout_session_id FROM payment WHERE booking_id = ? "
                        + "ORDER BY id DESC LIMIT 1",
                String.class,
                booking.getId());
    }

    /**
     * A date far enough ahead to sit outside any notice period, skipping Sunday.
     *
     * <p>Sunday closes at 20:00 (V5), so a plain "19:00 for an hour" would fail the
     * opening-hours rule one day in seven — a suite that goes red on a particular weekday and
     * wastes whoever is on duty.
     */
    private Instant daysAheadAt(int days, LocalTime time) {
        LocalDate date = clubClock.today().plusDays(days);
        if (date.getDayOfWeek() == DayOfWeek.SUNDAY) {
            date = date.plusDays(1);
        }
        return clubClock.toInstant(date, time);
    }
}

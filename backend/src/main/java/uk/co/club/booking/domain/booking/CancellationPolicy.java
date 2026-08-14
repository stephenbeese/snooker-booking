package uk.co.club.booking.domain.booking;

import java.time.Instant;
import org.springframework.stereotype.Component;
import uk.co.club.booking.common.error.BusinessRuleException;
import uk.co.club.booking.common.error.ErrorCode;
import uk.co.club.booking.common.time.ClubClock;
import uk.co.club.booking.domain.club.BookingSettings;
import uk.co.club.booking.domain.club.BookingSettingsRepository;

/**
 * Whether a booking may be cancelled, and by whom.
 *
 * <p>One implementation, used by both the customer endpoint and (later) the admin one, for the
 * same reason {@link BookingValidator} exists: a rule enforced at one entry point and forgotten
 * at another is how a system ends up with two different notions of its own policy.
 *
 * <p>The decision is returned as a value rather than only thrown, because the customer's
 * booking list needs to <em>show</em> whether each booking can be cancelled — greying out a
 * button the server would reject. A rule that can only be discovered by attempting the action
 * forces the client to reimplement it, which is how the button and the API drift apart.
 */
@Component
public class CancellationPolicy {

    private final BookingSettingsRepository bookingSettingsRepository;
    private final ClubClock clubClock;

    public CancellationPolicy(
            BookingSettingsRepository bookingSettingsRepository, ClubClock clubClock) {
        this.bookingSettingsRepository = bookingSettingsRepository;
        this.clubClock = clubClock;
    }

    /**
     * The outcome of asking "can this be cancelled?".
     *
     * @param cancellable whether cancellation would be accepted right now
     * @param cancellableUntil the instant after which a customer may no longer cancel, or null
     *     when the notice period does not apply (an unpaid hold, an already-terminal booking,
     *     or an admin who is not bound by it)
     * @param reason why not, when {@code cancellable} is false; null otherwise
     */
    public record Decision(
            boolean cancellable, Instant cancellableUntil, ErrorCode reason, String message) {

        static Decision allowed(Instant cancellableUntil) {
            return new Decision(true, cancellableUntil, null, null);
        }

        static Decision denied(ErrorCode reason, String message) {
            return new Decision(false, null, reason, message);
        }
    }

    /**
     * Decides without throwing. Used when building a response that must describe the option.
     *
     * @param isStaff staff bypass the notice period only. They do not bypass the terminal-state
     *     check, because "cancel a booking that already happened" is not a policy an admin may
     *     override — it is a request that does not mean anything.
     */
    public Decision evaluate(Booking booking, boolean isStaff) {
        Instant now = clubClock.now();

        if (booking.getStatus().isTerminal()) {
            return Decision.denied(
                    ErrorCode.BOOKING_NOT_CANCELLABLE,
                    "This booking is already " + describe(booking.getStatus()) + ".");
        }

        // The session is under way or over. Guarded separately from the notice period so the
        // message is honest: "it has already started" is not "you needed to give 24 hours".
        if (!booking.getStartAt().isAfter(now)) {
            return Decision.denied(
                    ErrorCode.BOOKING_NOT_CANCELLABLE,
                    "This booking has already started and cannot be cancelled online.");
        }

        // An unpaid hold is not a commitment the notice period protects — the club has no
        // money and the sweeper would release the slot within minutes anyway. Letting the
        // customer release it immediately returns the slot to sale sooner.
        if (booking.getStatus() == BookingStatus.PENDING_PAYMENT || isStaff) {
            return Decision.allowed(null);
        }

        BookingSettings settings =
                BookingSettings.require(bookingSettingsRepository.findSingleton());
        Instant deadline = booking.getStartAt().minus(settings.cancellationNotice());

        if (now.isAfter(deadline)) {
            return Decision.denied(
                    ErrorCode.CANCELLATION_TOO_LATE,
                    "Bookings must be cancelled at least "
                            + settings.getCancellationNoticeHours()
                            + " hours before the start time. Please call the club.");
        }

        return Decision.allowed(deadline);
    }

    /**
     * Whether cancelling this booking obliges the club to give the money back.
     *
     * <p>The club's terms are the notice period: a customer who cancels inside it has kept their
     * side of the bargain, so the refund is owed rather than decided. Outside it the money stays
     * a judgement — a late cancellation may fairly cost a fee, or be met with a credit — and
     * {@code PaymentService} raises it for a human instead.
     *
     * <p>Computes the deadline itself rather than reading {@link Decision#cancellableUntil}.
     * {@code evaluate} returns null there for an unpaid hold <em>and</em> for any staff
     * cancellation, both of which bypass the notice period entirely; reusing that value would
     * read a staff override past the deadline as though the customer had given proper notice,
     * and refund every late cancellation staff ever put through.
     *
     * <p>Deliberately ignores {@code isStaff}: who typed the cancellation says nothing about
     * whether the customer gave notice, which is the only question here.
     */
    public boolean qualifiesForAutomaticRefund(Booking booking) {
        if (booking.getStatus().isTerminal() && booking.getStatus() != BookingStatus.CANCELLED) {
            return false;
        }
        BookingSettings settings =
                BookingSettings.require(bookingSettingsRepository.findSingleton());
        Instant deadline = booking.getStartAt().minus(settings.cancellationNotice());
        return !clubClock.now().isAfter(deadline);
    }

    /** Throwing form, for the cancel endpoint itself. */
    public void requireCancellable(Booking booking, boolean isStaff) {
        Decision decision = evaluate(booking, isStaff);
        if (!decision.cancellable()) {
            throw new BusinessRuleException(decision.reason(), decision.message());
        }
    }

    private static String describe(BookingStatus status) {
        return switch (status) {
            case CANCELLED -> "cancelled";
            case EXPIRED -> "expired";
            case COMPLETED -> "complete";
            case NO_SHOW -> "recorded as a no-show";
            // Not reachable via isTerminal(), but a switch that silently returns something
            // wrong on a new enum constant is worse than one that says it does not know.
            case PENDING_PAYMENT, CONFIRMED -> "not cancellable";
        };
    }
}

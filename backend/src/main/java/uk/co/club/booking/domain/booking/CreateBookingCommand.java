package uk.co.club.booking.domain.booking;

import java.time.Instant;

/**
 * A validated request to create a booking, as the service layer sees it.
 *
 * <p>Distinct from the web DTO on purpose. The DTO speaks the client's language (a club-local
 * date plus a start time, because that is what a person picked in a grid); this speaks the
 * domain's (an instant, because that is what a table is occupied for). The conversion happens
 * once, in the controller, through {@code ClubClock}.
 *
 * <p>No price field. The price is computed by {@code PricingService} from the persisted
 * booking; a price arriving from a client is ignored, never trusted.
 *
 * @param tableId which table
 * @param startAt when the session starts
 * @param durationMinutes how long, validated against the configured increment and bounds
 * @param userId account the booking belongs to, or null for a telephone booking taken for
 *     someone with no account
 * @param customerName name to show on the day sheet — denormalised so a booking still reads
 *     correctly if the account is later renamed
 * @param actingUserId who is keying it in; differs from userId when staff book for a customer
 */
public record CreateBookingCommand(
        long tableId,
        Instant startAt,
        int durationMinutes,
        Long userId,
        String customerName,
        String customerEmail,
        String customerPhone,
        String notes,
        BookingSource source,
        Long actingUserId) {

    public Instant endAt() {
        return startAt.plus(java.time.Duration.ofMinutes(durationMinutes));
    }
}

package uk.co.club.booking.domain.booking;

import java.time.Instant;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import uk.co.club.booking.common.time.ClubClock;
import uk.co.club.booking.domain.payment.PaymentService;

/**
 * Releases slots held by checkouts nobody completed.
 *
 * <h2>Why a sweeper is necessary at all</h2>
 *
 * The overlap constraint's predicate cannot test hold expiry: a PostgreSQL index predicate must
 * be {@code IMMUTABLE}, and {@code now()} is not. (Marking a wrapper around {@code now()} as
 * immutable to get around this produces a genuinely corrupt index — the values are baked in at
 * write time and never re-evaluated.) So an expired hold keeps blocking its slot at the database
 * level until something updates the row.
 *
 * <p>Three layers cover this together: availability treats a lapsed hold as free so the slot
 * reappears immediately; booking creation expires conflicting lapsed holds in-transaction; and
 * this sweeper handles everything nobody happens to ask about.
 *
 * <p>Holds are marked EXPIRED, never deleted. A deleted booking cannot be reinstated when a late
 * payment arrives, and cannot be explained to a customer who asks what happened.
 */
@Component
public class HoldSweeper {

    private static final Logger log = LoggerFactory.getLogger(HoldSweeper.class);

    /**
     * Bounded so the first sweep after an outage cannot become one enormous transaction that
     * locks a large part of the booking table.
     */
    private static final int BATCH_SIZE = 100;

    private final BookingRepository bookingRepository;
    private final BookingService bookingService;
    private final PaymentService paymentService;
    private final ClubClock clubClock;

    public HoldSweeper(
            BookingRepository bookingRepository,
            BookingService bookingService,
            PaymentService paymentService,
            ClubClock clubClock) {
        this.bookingRepository = bookingRepository;
        this.bookingService = bookingService;
        this.paymentService = paymentService;
        this.clubClock = clubClock;
    }

    /**
     * Expires lapsed holds.
     *
     * <p>{@code fixedDelay}, not {@code fixedRate}: a slow sweep must not have the next one
     * starting on top of it. Idempotent, so a missed run costs nothing but a slot staying dark
     * slightly longer.
     *
     * <p>Tests set {@code booking.hold-sweeper.interval-ms} very high rather than removing the
     * bean, so they can call {@link #sweep()} directly at a controlled moment. A background
     * sweep firing mid-assertion would expire a fixture and produce a baffling flake.
     */
    @Scheduled(fixedDelayString = "${booking.hold-sweeper.interval-ms:60000}", initialDelay = 30_000)
    public void sweep() {
        Instant now = clubClock.now();
        List<Booking> lapsed =
                bookingRepository.findLapsedHolds(now, PageRequest.of(0, BATCH_SIZE));
        if (lapsed.isEmpty()) {
            return;
        }

        int released = 0;
        for (Booking booking : lapsed) {
            // Guarded update: 0 rows means a webhook confirmed this booking between the query
            // and now, so the customer paid in time and must keep their slot.
            if (bookingService.expireHold(booking.getId(), now) == 1) {
                released++;
                // Shrinks the window in which a late payment can arrive for a released slot,
                // from Stripe's 30-minute session minimum down to seconds. Best-effort: a
                // failure here must not stop the local hold being released.
                paymentService.cancelCheckoutFor(booking.getId());
            }
        }

        if (released > 0) {
            log.info("Released {} expired booking hold(s)", released);
        }
    }
}

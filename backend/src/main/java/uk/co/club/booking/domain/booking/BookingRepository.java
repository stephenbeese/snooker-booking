package uk.co.club.booking.domain.booking;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface BookingRepository extends JpaRepository<Booking, Long> {

    Optional<Booking> findByReference(String reference);

    boolean existsByReference(String reference);

    /**
     * Slot-occupying bookings intersecting a window.
     *
     * <p>Two details must stay aligned with the {@code booking_no_overlap} constraint in
     * V8, or the grid will disagree with what the database accepts:
     *
     * <ul>
     *   <li>Strict {@code <}/{@code >} comparisons for half-open {@code '[)'} semantics,
     *       so 14:00-15:00 and 15:00-16:00 are not treated as conflicting.
     *   <li>The same status set — supplied by {@link BookingStatus#slotOccupying()}.
     * </ul>
     */
    @Query("""
            SELECT b FROM Booking b
            WHERE b.snookerTable.id = :tableId
              AND b.status IN :statuses
              AND b.startAt < :windowEnd
              AND b.endAt > :windowStart
            ORDER BY b.startAt
            """)
    List<Booking> findOverlappingForTable(
            @Param("tableId") long tableId,
            @Param("windowStart") Instant windowStart,
            @Param("windowEnd") Instant windowEnd,
            @Param("statuses") Iterable<BookingStatus> statuses);

    /** All slot-occupying bookings in a window, for building a whole-day grid. */
    @Query("""
            SELECT b FROM Booking b
            WHERE b.status IN :statuses
              AND b.startAt < :windowEnd
              AND b.endAt > :windowStart
            ORDER BY b.snookerTable.id, b.startAt
            """)
    List<Booking> findOverlapping(
            @Param("windowStart") Instant windowStart,
            @Param("windowEnd") Instant windowEnd,
            @Param("statuses") Iterable<BookingStatus> statuses);

    List<Booking> findByUserIdOrderByStartAtDesc(long userId);

    /**
     * Confirms a booking if and only if it is still awaiting payment.
     *
     * <p>The {@code WHERE status = 'PENDING_PAYMENT'} clause is the entire idempotency
     * mechanism. Confirmation arrives from two uncoordinated directions — the Stripe webhook
     * and the customer's browser returning from Checkout — and whichever is second updates 0
     * rows instead of double-confirming or clobbering a cancellation.
     *
     * <p>Clears the hold expiry in the same statement: a CHECK constraint requires it to be
     * null unless the status is PENDING_PAYMENT, so setting one without the other fails.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            UPDATE Booking b
               SET b.status = uk.co.club.booking.domain.booking.BookingStatus.CONFIRMED,
                   b.holdExpiresAt = NULL
             WHERE b.id = :bookingId
               AND b.status = uk.co.club.booking.domain.booking.BookingStatus.PENDING_PAYMENT
            """)
    int confirmIfPending(@Param("bookingId") long bookingId);

    /**
     * Marks a lapsed hold as expired, releasing its slot.
     *
     * <p>Guarded on both the status and the expiry having actually passed, so a race with a
     * confirming webhook cannot expire a booking that has just been paid for.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            UPDATE Booking b
               SET b.status = uk.co.club.booking.domain.booking.BookingStatus.EXPIRED,
                   b.holdExpiresAt = NULL
             WHERE b.id = :bookingId
               AND b.status = uk.co.club.booking.domain.booking.BookingStatus.PENDING_PAYMENT
               AND b.holdExpiresAt < :now
            """)
    int expireHold(@Param("bookingId") long bookingId, @Param("now") Instant now);

    /**
     * Re-confirms a booking that was released before a late payment landed.
     *
     * <p>Only from EXPIRED — not from CANCELLED. A customer who cancelled and then had a
     * payment settle wants a refund, not their slot silently reinstated. The overlap
     * constraint still adjudicates, so this fails if the slot has since been resold.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            UPDATE Booking b
               SET b.status = uk.co.club.booking.domain.booking.BookingStatus.CONFIRMED,
                   b.holdExpiresAt = NULL
             WHERE b.id = :bookingId
               AND b.status = uk.co.club.booking.domain.booking.BookingStatus.EXPIRED
            """)
    int reinstateIfReleased(@Param("bookingId") long bookingId);

    /**
     * Holds due for expiry. Batch-limited so a long outage cannot produce one enormous
     * transaction on the first sweep after recovery.
     */
    @Query("""
            SELECT b FROM Booking b
            WHERE b.status = uk.co.club.booking.domain.booking.BookingStatus.PENDING_PAYMENT
              AND b.holdExpiresAt < :now
            ORDER BY b.holdExpiresAt
            """)
    List<Booking> findLapsedHolds(@Param("now") Instant now, Pageable pageable);
}

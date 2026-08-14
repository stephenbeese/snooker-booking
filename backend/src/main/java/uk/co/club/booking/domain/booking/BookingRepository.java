package uk.co.club.booking.domain.booking;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
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

    /**
     * A customer's bookings, with the table fetched in the same query.
     *
     * <p>The {@code JOIN FETCH} is required, not an optimisation. {@code snookerTable} is LAZY
     * and {@code open-in-view} is off, so the proxy is dead by the time the controller builds
     * the DTO — every row would throw LazyInitializationException. Fetching here also avoids
     * N+1: one query for the list rather than one per booking.
     */
    @Query("""
            SELECT b FROM Booking b
            JOIN FETCH b.snookerTable
            WHERE b.userId = :userId
            ORDER BY b.startAt DESC
            """)
    List<Booking> findByUserIdOrderByStartAtDesc(@Param("userId") long userId);

    /** Same eager fetch, for the single-booking view. */
    @Query("""
            SELECT b FROM Booking b
            JOIN FETCH b.snookerTable
            WHERE b.reference = :reference
            """)
    Optional<Booking> findByReferenceWithTable(@Param("reference") String reference);

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
     * Cancels a booking, releasing its slot.
     *
     * <p>Guarded on the status for the same reason confirmation is: cancellation races the
     * webhook and the sweeper. Restricting the update to the two live statuses means a booking
     * that was confirmed, expired or cancelled a moment ago updates 0 rows rather than
     * overwriting whichever of those happened.
     *
     * <p>Clears {@code holdExpiresAt} because a CHECK constraint requires it to be null unless
     * the status is PENDING_PAYMENT — cancelling a hold without clearing it fails.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            UPDATE Booking b
               SET b.status = uk.co.club.booking.domain.booking.BookingStatus.CANCELLED,
                   b.holdExpiresAt = NULL,
                   b.cancelledAt = :now,
                   b.cancelledByUserId = :cancelledBy,
                   b.cancellationReason = :reason
             WHERE b.id = :bookingId
               AND b.status IN (
                     uk.co.club.booking.domain.booking.BookingStatus.PENDING_PAYMENT,
                     uk.co.club.booking.domain.booking.BookingStatus.CONFIRMED)
            """)
    int cancelIfLive(
            @Param("bookingId") long bookingId,
            @Param("now") Instant now,
            @Param("cancelledBy") Long cancelledBy,
            @Param("reason") String reason);

    /**
     * The admin booking list: every filter optional, applied in one query.
     *
     * <p>Each predicate is null-guarded (`:param IS NULL OR ...`) so one query serves every
     * combination of filters. A Specification or a hand-built query string would do the same
     * thing with more machinery and one more place for an unparameterised value to creep in.
     *
     * <p>The search term matches reference, customer name or email. It is bound as a
     * parameter and never concatenated, so a term containing a quote is a search for that
     * character rather than a syntax error — or worse.
     *
     * <p>{@code JOIN FETCH} for the same reason as the customer list: the table association is
     * LAZY and open-in-view is off, so the DTO would otherwise be built from a dead proxy.
     * Paging a fetch join is safe here because it is a to-one — Hibernate pages it in SQL.
     */
    @Query(value = """
            SELECT b FROM Booking b
            JOIN FETCH b.snookerTable t
            WHERE (:statuses IS NULL OR b.status IN :statuses)
              AND (CAST(:from AS timestamp) IS NULL OR b.startAt >= :from)
              AND (CAST(:to AS timestamp) IS NULL OR b.startAt < :to)
              AND (:tableId IS NULL OR t.id = :tableId)
              AND (:search IS NULL
                   OR LOWER(b.reference) LIKE :search
                   OR LOWER(b.customerName) LIKE :search
                   OR LOWER(b.customerEmail) LIKE :search)
            """,
            countQuery = """
            SELECT COUNT(b) FROM Booking b
            WHERE (:statuses IS NULL OR b.status IN :statuses)
              AND (CAST(:from AS timestamp) IS NULL OR b.startAt >= :from)
              AND (CAST(:to AS timestamp) IS NULL OR b.startAt < :to)
              AND (:tableId IS NULL OR b.snookerTable.id = :tableId)
              AND (:search IS NULL
                   OR LOWER(b.reference) LIKE :search
                   OR LOWER(b.customerName) LIKE :search
                   OR LOWER(b.customerEmail) LIKE :search)
            """)
    Page<Booking> search(
            @Param("statuses") Collection<BookingStatus> statuses,
            @Param("from") Instant from,
            @Param("to") Instant to,
            @Param("tableId") Long tableId,
            @Param("search") String search,
            Pageable pageable);

    /** Bookings in a window regardless of status, for the admin day view and dashboard counts. */
    @Query("""
            SELECT b FROM Booking b
            JOIN FETCH b.snookerTable
            WHERE b.startAt >= :windowStart AND b.startAt < :windowEnd
            ORDER BY b.startAt
            """)
    List<Booking> findStartingBetween(
            @Param("windowStart") Instant windowStart, @Param("windowEnd") Instant windowEnd);

    /**
     * How many bookings each of these customers has, for the customer directory.
     *
     * <p>One query for a whole page rather than a count per row. Customers with no bookings are
     * simply absent from the result — there is nothing to group — so the caller treats a missing
     * id as zero rather than expecting a row of zero.
     */
    @Query("""
            SELECT b.userId, COUNT(b) FROM Booking b
            WHERE b.userId IN :userIds
            GROUP BY b.userId
            """)
    List<Object[]> countByUserIds(@Param("userIds") Collection<Long> userIds);

    /** How many bookings hold each status in a window. Counted in the database, not in Java. */
    @Query("""
            SELECT b.status, COUNT(b) FROM Booking b
            WHERE b.startAt >= :windowStart AND b.startAt < :windowEnd
            GROUP BY b.status
            """)
    List<Object[]> countByStatusBetween(
            @Param("windowStart") Instant windowStart, @Param("windowEnd") Instant windowEnd);

    /** Live holds still counting down, for the dashboard's "awaiting payment" figure. */
    long countByStatusAndHoldExpiresAtAfter(BookingStatus status, Instant now);

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

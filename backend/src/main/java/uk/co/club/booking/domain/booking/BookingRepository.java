package uk.co.club.booking.domain.booking;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
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
}

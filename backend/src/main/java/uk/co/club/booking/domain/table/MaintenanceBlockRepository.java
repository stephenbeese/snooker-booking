package uk.co.club.booking.domain.table;

import java.time.Instant;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MaintenanceBlockRepository extends JpaRepository<MaintenanceBlock, Long> {

    /**
     * Blocks intersecting a window.
     *
     * <p>Strict comparisons give half-open {@code [start, end)} semantics, matching the
     * {@code '[)'} bounds of the database exclusion constraints. Using {@code <=}/{@code >=}
     * here would report a conflict for merely abutting periods and disagree with the
     * database.
     */
    @Query("""
            SELECT b FROM MaintenanceBlock b
            WHERE b.startAt < :windowEnd
              AND b.endAt > :windowStart
            ORDER BY b.startAt
            """)
    List<MaintenanceBlock> findOverlapping(
            @Param("windowStart") Instant windowStart, @Param("windowEnd") Instant windowEnd);

    @Query("""
            SELECT b FROM MaintenanceBlock b
            WHERE b.snookerTable.id = :tableId
              AND b.startAt < :windowEnd
              AND b.endAt > :windowStart
            ORDER BY b.startAt
            """)
    List<MaintenanceBlock> findOverlappingForTable(
            @Param("tableId") long tableId,
            @Param("windowStart") Instant windowStart,
            @Param("windowEnd") Instant windowEnd);
}

package uk.co.club.booking.domain.admin.web.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import uk.co.club.booking.common.time.ClubClock;
import uk.co.club.booking.domain.table.MaintenanceBlock;

/**
 * A maintenance block for staff.
 *
 * <p>Carries both the instants and the club-local date/time. Staff think in wall-clock terms
 * ("Table 3, Tuesday afternoon") but the instants are what the system reasons about, and
 * deriving one from the other in the browser would put a timezone conversion in two places.
 */
public record MaintenanceBlockResponse(
        long id,
        long tableId,
        String tableName,
        LocalDate date,
        LocalTime startTime,
        LocalTime endTime,
        Instant startAt,
        Instant endAt,
        String reason) {

    public static MaintenanceBlockResponse from(MaintenanceBlock block, ClubClock clock) {
        return new MaintenanceBlockResponse(
                block.getId(),
                block.getSnookerTable().getId(),
                block.getSnookerTable().getName(),
                clock.toLocalDate(block.getStartAt()),
                clock.toLocalTime(block.getStartAt()),
                clock.toLocalTime(block.getEndAt()),
                block.getStartAt(),
                block.getEndAt(),
                block.getReason());
    }
}

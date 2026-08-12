package uk.co.club.booking.domain.availability;

import java.util.List;
import uk.co.club.booking.domain.table.TableType;

/**
 * One row of the availability grid.
 *
 * @param hourlyRatePence rate for this table, so the client can show per-table pricing
 *     without a second request
 */
public record TableAvailability(
        long tableId,
        String tableName,
        TableType tableType,
        boolean tableActive,
        int hourlyRatePence,
        List<SlotView> slots) {}

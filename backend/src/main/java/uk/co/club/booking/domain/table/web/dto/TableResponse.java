package uk.co.club.booking.domain.table.web.dto;

import uk.co.club.booking.domain.table.SnookerTable;

/**
 * A table as the client needs it.
 *
 * <p>{@code notes} is deliberately absent: it is a staff field ("cushion needs recovering") and
 * this endpoint is public.
 */
public record TableResponse(
        long id, String name, String tableType, int displayOrder, boolean active) {

    public static TableResponse from(SnookerTable table) {
        return new TableResponse(
                table.getId(),
                table.getName(),
                table.getTableType(),
                table.getDisplayOrder(),
                table.isActive());
    }
}

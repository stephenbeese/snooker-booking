package uk.co.club.booking.domain.admin.web.dto;

import uk.co.club.booking.domain.table.SnookerTable;

/**
 * A table as staff see it.
 *
 * <p>Distinct from the public {@code TableResponse} solely because it includes {@code notes},
 * which is a staff field ("cushion needs recovering") that must not reach a customer. Sharing
 * one DTO and hoping the public endpoint never populates the field is exactly how that leaks.
 */
public record AdminTableResponse(
        long id,
        String name,
        String tableType,
        int displayOrder,
        boolean active,
        String notes) {

    public static AdminTableResponse from(SnookerTable table) {
        return new AdminTableResponse(
                table.getId(),
                table.getName(),
                table.getTableType(),
                table.getDisplayOrder(),
                table.isActive(),
                table.getNotes());
    }
}

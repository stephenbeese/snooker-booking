package uk.co.club.booking.domain.admin.web.dto;

import uk.co.club.booking.domain.table.TableTypeEntity;

/** A table type as staff see it. */
public record TableTypeResponse(
        String code, String label, int displayOrder, boolean active) {

    public static TableTypeResponse from(TableTypeEntity type) {
        return new TableTypeResponse(
                type.getCode(), type.getLabel(), type.getDisplayOrder(), type.isActive());
    }
}

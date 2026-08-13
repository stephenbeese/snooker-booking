package uk.co.club.booking.domain.admin.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import uk.co.club.booking.domain.table.TableType;

/**
 * Creating or renaming a table.
 *
 * <p>No {@code active} field: activation is a separate endpoint. Taking a table out of service
 * is a different decision from renaming one, and folding it into a general update makes it
 * possible to deactivate a table by accident while editing its display order.
 */
public record TableRequest(
        @NotBlank @Size(max = 100) String name,
        @NotNull TableType tableType,
        @PositiveOrZero int displayOrder,
        @Size(max = 500) String notes) {}

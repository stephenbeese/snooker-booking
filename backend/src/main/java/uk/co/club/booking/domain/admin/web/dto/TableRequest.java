package uk.co.club.booking.domain.admin.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

/**
 * Creating or renaming a table.
 *
 * <p>No {@code active} field: activation is a separate endpoint. Taking a table out of service
 * is a different decision from renaming one, and folding it into a general update makes it
 * possible to deactivate a table by accident while editing its display order.
 */
public record TableRequest(
        @NotBlank @Size(max = 100) String name,
        // NotBlank rather than NotNull: the type became a String in V15, and NotNull would
        // let "" through to be rejected later as an unknown type — a 422 about the club's
        // configuration, where the honest answer is a 400 about a missing field.
        @NotBlank String tableType,
        @PositiveOrZero int displayOrder,
        @Size(max = 500) String notes) {}

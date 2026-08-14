package uk.co.club.booking.domain.admin.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;

/** Request bodies for managing table types and table order. */
public final class TableTypeRequests {

    private TableTypeRequests() {}

    /**
     * A table type.
     *
     * <p>No code field: it is derived from the label when the type is created and immutable
     * afterwards, because tables and pricing rules reference it. Letting a client send one
     * would invite codes that disagree with their labels, and a rename that orphans rows.
     */
    public record TableTypeInput(
            @NotBlank @Size(max = 60) String label, Integer displayOrder) {}

    /**
     * The new order of every table, front to back.
     *
     * <p>All of them, not a subset — see {@code SnookerTableService.reorder} for why a partial
     * list is refused rather than merged.
     */
    public record TableOrder(@NotEmpty List<Long> tableIds) {}
}

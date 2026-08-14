package uk.co.club.booking.domain.admin.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;
import uk.co.club.booking.domain.cafe.CafeCategory;

/** Request and response bodies for menu categories. */
public final class CafeCategoryRequests {

    private CafeCategoryRequests() {}

    /**
     * A menu category.
     *
     * <p>No code field, exactly as {@code TableTypeInput} has none: it is derived from the label
     * when the category is created and immutable afterwards, because items reference it. Letting
     * a client send one would invite codes that disagree with their labels.
     */
    public record CafeCategoryInput(
            @NotBlank @Size(max = 60) String label, Integer displayOrder) {}

    /**
     * The new running order of every category, top to bottom.
     *
     * <p>All of them, not a subset — see {@code CafeCategoryService.reorder} for why a partial
     * list is refused rather than merged.
     */
    public record CafeCategoryOrder(@NotEmpty List<String> categoryCodes) {}

    /** A category as staff see it, withdrawn ones included. */
    public record CafeCategoryResponse(
            String code, String label, int displayOrder, boolean active) {

        public static CafeCategoryResponse from(CafeCategory category) {
            return new CafeCategoryResponse(
                    category.getCode(),
                    category.getLabel(),
                    category.getDisplayOrder(),
                    category.isActive());
        }
    }
}

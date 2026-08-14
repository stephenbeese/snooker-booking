package uk.co.club.booking.domain.cafe.web;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uk.co.club.booking.domain.cafe.CafeCategory;
import uk.co.club.booking.domain.cafe.CafeCategoryService;
import uk.co.club.booking.domain.cafe.CafeItem;
import uk.co.club.booking.domain.cafe.CafeItemService;

/**
 * The cafe and bar menu, as a customer reads it.
 *
 * <p>Public, like the tables and the club details: someone deciding whether to come down should
 * not have to make an account to see what the bar sells.
 *
 * <p><strong>Active items only</strong>, and not by a query parameter. The admin endpoint returns
 * withdrawn items because staff need to see what they took off and put it back; a customer must
 * never be shown something the club has stopped selling. Deciding that here rather than from a
 * parameter is what stops anyone asking for the staff view — the same reasoning as
 * {@code TableController}, which reads it from the principal for the same reason.
 */
@RestController
@RequestMapping("/api/cafe")
public class CafeController {

    /** What uncategorised items are filed under. Last, after every named section. */
    private static final String UNCATEGORISED_LABEL = "Other";

    private final CafeItemService cafeItemService;
    private final CafeCategoryService categoryService;

    public CafeController(CafeItemService cafeItemService, CafeCategoryService categoryService) {
        this.cafeItemService = cafeItemService;
        this.categoryService = categoryService;
    }

    /**
     * The menu, grouped into sections.
     *
     * <p>Grouped here rather than in the browser because the section order is the club's, held in
     * {@code display_order}, and a client regrouping a flat list would have to be told that order
     * separately and be trusted to apply it. One shape, decided once.
     *
     * <p>Empty sections are omitted: a category a club has created but not yet filled is not
     * something a customer needs to read a heading for.
     */
    @GetMapping("/items")
    public List<MenuSection> menu() {
        List<CafeItem> items = cafeItemService.findActive();

        // Seeded in the club's own category order so the sections come out in that order, and
        // so an empty one can be dropped below rather than never being known about.
        Map<String, List<PublicCafeItem>> byCategory = new LinkedHashMap<>();
        Map<String, String> labels = new LinkedHashMap<>();
        for (CafeCategory category : categoryService.findActive()) {
            byCategory.put(category.getCode(), new ArrayList<>());
            labels.put(category.getCode(), category.getLabel());
        }

        List<PublicCafeItem> uncategorised = new ArrayList<>();
        for (CafeItem item : items) {
            String code = item.getCategoryCode();
            // computeIfAbsent rather than a plain get: an item may carry a category that has
            // since been withdrawn, which is absent from the list above. Dropping it would make
            // an item on sale invisible on the menu — worse than an extra heading.
            List<PublicCafeItem> bucket =
                    code == null ? uncategorised : byCategory.computeIfAbsent(code, key -> new ArrayList<>());
            bucket.add(PublicCafeItem.from(item));
        }

        List<MenuSection> sections = new ArrayList<>();
        byCategory.forEach((code, bucket) -> {
            if (!bucket.isEmpty()) {
                // A withdrawn category has no label here; its own code is a better heading than
                // nothing, and it only appears while an on-sale item still carries it.
                sections.add(new MenuSection(code, labels.getOrDefault(code, code), bucket));
            }
        });
        if (!uncategorised.isEmpty()) {
            sections.add(new MenuSection(null, UNCATEGORISED_LABEL, uncategorised));
        }
        return sections;
    }

    /** One section of the menu: a heading and the items under it. */
    public record MenuSection(String code, String label, List<PublicCafeItem> items) {}

    /**
     * A menu item as a customer sees it.
     *
     * <p>No {@code active} and no {@code displayOrder}: everything here is on sale by
     * construction, and the order is expressed by the position in the list rather than by a
     * number the client would have to sort on. Both are staff concerns, and a field a customer
     * has no use for is a field that can leak one.
     */
    public record PublicCafeItem(
            long id, String name, String description, int pricePence, String imageUrl) {

        static PublicCafeItem from(CafeItem item) {
            return new PublicCafeItem(
                    item.getId(),
                    item.getName(),
                    item.getDescription(),
                    item.getPricePence(),
                    item.getImageUrl());
        }
    }
}

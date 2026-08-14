package uk.co.club.booking.domain.cafe.web;

import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
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

    private final CafeItemService cafeItemService;

    public CafeController(CafeItemService cafeItemService) {
        this.cafeItemService = cafeItemService;
    }

    @GetMapping("/items")
    public List<PublicCafeItem> items() {
        return cafeItemService.findActive().stream().map(PublicCafeItem::from).toList();
    }

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

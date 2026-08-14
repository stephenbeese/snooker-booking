package uk.co.club.booking.domain.admin.web.dto;

import uk.co.club.booking.domain.cafe.CafeItem;

/**
 * A menu item as staff see it.
 *
 * <p>A record rather than the entity: returning {@code CafeItem} would put a JPA object on the
 * wire, serialise {@code createdAt}/{@code updatedAt} nobody asked for, and tie the API shape to
 * the table's shape.
 *
 * <p>{@code pricePence} is integer pence, formatted for display by the client and never sent
 * pre-formatted — the server does not know what currency conventions the reader expects.
 */
public record CafeItemResponse(
        long id,
        String name,
        String description,
        int pricePence,
        String imageUrl,
        int displayOrder,
        boolean active) {

    public static CafeItemResponse from(CafeItem item) {
        return new CafeItemResponse(
                item.getId(),
                item.getName(),
                item.getDescription(),
                item.getPricePence(),
                item.getImageUrl(),
                item.getDisplayOrder(),
                item.isActive());
    }
}

package uk.co.club.booking.domain.admin.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

/**
 * A menu item as staff submit it.
 *
 * <p>{@code pricePence} is an {@code int} of pence, not pounds and not a decimal. A client that
 * sent 12.50 would be rejected by binding rather than quietly stored as 12 — which is the whole
 * reason money travels as pence here.
 *
 * <p>{@code displayOrder} is nullable: omitting it means "put it at the end", which is what
 * someone adding an item to a menu almost always wants.
 */
public record CafeItemRequest(
        @NotBlank @Size(max = 120) String name,
        @Size(max = 500) String description,
        @PositiveOrZero(message = "A price cannot be negative.") int pricePence,
        @Size(max = 2000) String imageUrl,
        Integer displayOrder) {}

package uk.co.club.booking.domain.admin.web.dto;

import java.util.List;
import java.util.function.Function;
import org.springframework.data.domain.Page;

/**
 * A page of results.
 *
 * <p>Hand-rolled rather than serialising Spring's {@code Page}: that type's JSON shape is an
 * implementation detail Spring has already changed once, and it carries a {@code Pageable} the
 * client has no use for.
 */
public record PagedResponse<T>(
        List<T> items, int page, int size, long totalItems, int totalPages) {

    public static <E, T> PagedResponse<T> of(Page<E> page, Function<E, T> mapper) {
        return new PagedResponse<>(
                page.getContent().stream().map(mapper).toList(),
                page.getNumber(),
                page.getSize(),
                page.getTotalElements(),
                page.getTotalPages());
    }
}

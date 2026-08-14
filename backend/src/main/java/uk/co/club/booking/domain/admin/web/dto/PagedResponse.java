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
        return ofAll(page, content -> content.stream().map(mapper).toList());
    }

    /**
     * Maps the whole page at once.
     *
     * <p>For mappers that need a batch fetch — the admin booking list loads every payment for the
     * page in one query, which a per-item {@link Function} cannot express without an N+1.
     */
    public static <E, T> PagedResponse<T> ofAll(Page<E> page, Function<List<E>, List<T>> mapper) {
        return new PagedResponse<>(
                mapper.apply(page.getContent()),
                page.getNumber(),
                page.getSize(),
                page.getTotalElements(),
                page.getTotalPages());
    }
}

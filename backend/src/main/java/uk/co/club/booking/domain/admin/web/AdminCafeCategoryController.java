package uk.co.club.booking.domain.admin.web;

import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uk.co.club.booking.domain.admin.web.dto.CafeCategoryRequests.CafeCategoryInput;
import uk.co.club.booking.domain.admin.web.dto.CafeCategoryRequests.CafeCategoryOrder;
import uk.co.club.booking.domain.admin.web.dto.CafeCategoryRequests.CafeCategoryResponse;
import uk.co.club.booking.domain.cafe.CafeCategoryService;

/**
 * The sections of the cafe and bar menu.
 *
 * <p>ADMIN-only. Sits under {@code /api/admin/cafe/**}, which {@code SecurityConfig} already
 * restricts as a whole — unlike table types, this path needs no separate matcher because it is a
 * genuine sub-path of one that is already covered.
 *
 * <p>No DELETE, for the same reason as everywhere else here: items reference a category by code,
 * and removing one would orphan them. Withdrawing takes it off the list of choices while leaving
 * existing items readable.
 */
@RestController
@RequestMapping("/api/admin/cafe/categories")
public class AdminCafeCategoryController {

    private final CafeCategoryService categoryService;

    public AdminCafeCategoryController(CafeCategoryService categoryService) {
        this.categoryService = categoryService;
    }

    /** Every category, withdrawn ones included — staff need to see what they retired. */
    @GetMapping
    public List<CafeCategoryResponse> list() {
        return categoryService.findAll().stream().map(CafeCategoryResponse::from).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CafeCategoryResponse create(@Valid @RequestBody CafeCategoryInput request) {
        return CafeCategoryResponse.from(
                categoryService.create(request.label(), request.displayOrder()));
    }

    /**
     * Rewrites the whole running order at once.
     *
     * <p>{@code /order} and {@code /{code}} are both a single segment, so they genuinely overlap
     * as URL patterns — the V17 CHECK constrains what may be *stored* as a code and has no say in
     * routing. Spring resolves it: a literal segment always outranks a variable one, whatever the
     * declaration order. Declared first anyway, so the two are read together rather than the
     * ordering looking accidental.
     */
    @PutMapping("/order")
    public List<CafeCategoryResponse> reorder(@Valid @RequestBody CafeCategoryOrder request) {
        return categoryService.reorder(request.categoryCodes()).stream()
                .map(CafeCategoryResponse::from)
                .toList();
    }

    /** Renames or reorders one. The code is immutable — see {@code CafeCategory}. */
    @PutMapping("/{code}")
    public CafeCategoryResponse update(
            @PathVariable String code, @Valid @RequestBody CafeCategoryInput request) {
        return CafeCategoryResponse.from(
                categoryService.update(code, request.label(), request.displayOrder()));
    }

    @PutMapping("/{code}/active")
    public CafeCategoryResponse setActive(
            @PathVariable String code, @RequestParam boolean active) {
        return CafeCategoryResponse.from(categoryService.setActive(code, active));
    }
}

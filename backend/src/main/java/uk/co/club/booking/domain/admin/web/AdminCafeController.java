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
import uk.co.club.booking.domain.admin.web.dto.CafeItemRequest;
import uk.co.club.booking.domain.admin.web.dto.CafeItemResponse;
import uk.co.club.booking.domain.cafe.CafeItemService;

/**
 * The cafe and bar menu.
 *
 * <p>ADMIN-only, enforced by {@code SecurityConfig} rather than here — a second place to check is
 * a second place to forget. Prices are club configuration in the same sense as pricing rules: a
 * STAFF member on the counter reads the menu, they do not set it.
 *
 * <p>There is deliberately no DELETE. See {@link CafeItemService} — an item is deactivated so a
 * withdrawn one stays explicable, and so historic bills will still resolve once bills exist.
 */
@RestController
@RequestMapping("/api/admin/cafe/items")
public class AdminCafeController {

    private final CafeItemService cafeItemService;

    public AdminCafeController(CafeItemService cafeItemService) {
        this.cafeItemService = cafeItemService;
    }

    /** Every item, including withdrawn ones — staff need to see what they took off the menu. */
    @GetMapping
    public List<CafeItemResponse> list() {
        return cafeItemService.findAll().stream().map(CafeItemResponse::from).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CafeItemResponse create(@Valid @RequestBody CafeItemRequest request) {
        return CafeItemResponse.from(
                cafeItemService.create(
                        request.name(),
                        request.description(),
                        request.pricePence(),
                        request.imageUrl(),
                        request.categoryCode(),
                        request.displayOrder()));
    }

    @PutMapping("/{id}")
    public CafeItemResponse update(
            @PathVariable long id, @Valid @RequestBody CafeItemRequest request) {
        return CafeItemResponse.from(
                cafeItemService.update(
                        id,
                        request.name(),
                        request.description(),
                        request.pricePence(),
                        request.imageUrl(),
                        request.categoryCode(),
                        request.displayOrder()));
    }

    /** Takes an item off the menu, or puts it back. Separate so it is always deliberate. */
    @PutMapping("/{id}/active")
    public CafeItemResponse setActive(@PathVariable long id, @RequestParam boolean active) {
        return CafeItemResponse.from(cafeItemService.setActive(id, active));
    }
}

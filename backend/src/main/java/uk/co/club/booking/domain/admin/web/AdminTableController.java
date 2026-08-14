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
import uk.co.club.booking.domain.admin.web.dto.AdminTableResponse;
import uk.co.club.booking.domain.admin.web.dto.TableRequest;
import uk.co.club.booking.domain.admin.web.dto.TableTypeRequests;
import uk.co.club.booking.domain.table.SnookerTableService;

/**
 * Table management.
 *
 * <p>Every path under {@code /api/admin/**} already requires the ADMIN role in
 * {@code SecurityConfig}, so there is no per-method check here — a second place to enforce it
 * is a second place to forget it.
 *
 * <p>There is deliberately no DELETE. See {@link SnookerTableService} — bookings reference
 * tables historically, so a table is deactivated rather than removed.
 */
@RestController
@RequestMapping("/api/admin/tables")
public class AdminTableController {

    private final SnookerTableService tableService;

    public AdminTableController(SnookerTableService tableService) {
        this.tableService = tableService;
    }

    /** Every table, including inactive ones — staff need to see what they have taken off sale. */
    @GetMapping
    public List<AdminTableResponse> list() {
        return tableService.findAll().stream().map(AdminTableResponse::from).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AdminTableResponse create(@Valid @RequestBody TableRequest request) {
        return AdminTableResponse.from(
                tableService.create(
                        request.name(),
                        request.tableType(),
                        request.displayOrder(),
                        request.notes()));
    }

    @PutMapping("/{id}")
    public AdminTableResponse update(
            @PathVariable long id, @Valid @RequestBody TableRequest request) {
        return AdminTableResponse.from(
                tableService.update(
                        id,
                        request.name(),
                        request.tableType(),
                        request.displayOrder(),
                        request.notes()));
    }

    /**
     * Takes a table off sale, or puts it back.
     *
     * <p>Separate from the update endpoint so that deactivating is always a deliberate act
     * rather than a side effect of editing a name.
     */
    @PutMapping("/{id}/active")
    public AdminTableResponse setActive(@PathVariable long id, @RequestParam boolean active) {
        return AdminTableResponse.from(tableService.setActive(id, active));
    }

    /**
     * Rewrites the whole display order at once.
     *
     * <p>Before {@code /{id}} would have been ambiguous, but "order" is not a number so the two
     * cannot collide. One bulk write rather than a PUT per table — see
     * {@link SnookerTableService#reorder} for why.
     */
    @PutMapping("/order")
    public List<AdminTableResponse> reorder(
            @Valid @RequestBody TableTypeRequests.TableOrder request) {
        return tableService.reorder(request.tableIds()).stream()
                .map(AdminTableResponse::from)
                .toList();
    }
}

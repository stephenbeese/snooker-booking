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
import uk.co.club.booking.domain.admin.web.dto.TableTypeRequests;
import uk.co.club.booking.domain.admin.web.dto.TableTypeResponse;
import uk.co.club.booking.domain.table.TableTypeService;

/**
 * The kinds of table the club holds.
 *
 * <p>ADMIN-only, set in {@code SecurityConfig} alongside tables and settings rather than here:
 * adding a type changes what every table and every pricing rule may be, which is club
 * configuration rather than the day job. Note that {@code /api/admin/tables/**} does not cover
 * this path — the hyphen makes {@code table-types} a different segment — so it is listed
 * explicitly there.
 *
 * <p>There is no DELETE, for the same reason tables have none: a type is referenced by the
 * tables and pricing rules that carry it, and removing it would orphan them. Deactivating takes
 * it off the list of choices while leaving history readable.
 */
@RestController
@RequestMapping("/api/admin/table-types")
public class AdminTableTypeController {

    private final TableTypeService tableTypeService;

    public AdminTableTypeController(TableTypeService tableTypeService) {
        this.tableTypeService = tableTypeService;
    }

    /** Every type, including inactive ones — staff need to see what they have withdrawn. */
    @GetMapping
    public List<TableTypeResponse> list() {
        return tableTypeService.findAll().stream().map(TableTypeResponse::from).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TableTypeResponse create(@Valid @RequestBody TableTypeRequests.TableTypeInput request) {
        return TableTypeResponse.from(
                tableTypeService.create(request.label(), request.displayOrder()));
    }

    /** Renames or reorders. The code is immutable — see {@code TableTypeEntity}. */
    @PutMapping("/{code}")
    public TableTypeResponse update(
            @PathVariable String code, @Valid @RequestBody TableTypeRequests.TableTypeInput request) {
        return TableTypeResponse.from(
                tableTypeService.update(code, request.label(), request.displayOrder()));
    }

    @PutMapping("/{code}/active")
    public TableTypeResponse setActive(
            @PathVariable String code, @RequestParam boolean active) {
        return TableTypeResponse.from(tableTypeService.setActive(code, active));
    }
}

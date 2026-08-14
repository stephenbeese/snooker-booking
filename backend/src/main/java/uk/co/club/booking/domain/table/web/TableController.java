package uk.co.club.booking.domain.table.web;

import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uk.co.club.booking.domain.table.SnookerTable;
import uk.co.club.booking.domain.table.SnookerTableRepository;
import uk.co.club.booking.domain.table.TableTypeService;
import uk.co.club.booking.domain.table.web.dto.TableResponse;
import uk.co.club.booking.security.AppUserPrincipal;

/**
 * The club's tables.
 *
 * <p>Public, because the availability grid labels its rows with these names and browsing must
 * not require an account.
 *
 * <p>Customers see only active tables; staff see all of them, because a deactivated table is
 * still a thing they need to filter and report on. That difference is decided here from the
 * authenticated principal rather than from a query parameter — a parameter would let anyone ask
 * for the staff view.
 */
@RestController
@RequestMapping("/api/tables")
public class TableController {

    private final SnookerTableRepository tableRepository;
    private final TableTypeService tableTypeService;

    public TableController(
            SnookerTableRepository tableRepository, TableTypeService tableTypeService) {
        this.tableRepository = tableRepository;
        this.tableTypeService = tableTypeService;
    }

    @GetMapping
    public List<TableResponse> list(@AuthenticationPrincipal AppUserPrincipal principal) {
        boolean isStaff = principal != null && principal.isStaff();
        List<SnookerTable> tables = isStaff
                ? tableRepository.findAllByOrderByDisplayOrderAscIdAsc()
                : tableRepository.findAllByActiveTrueOrderByDisplayOrderAscIdAsc();
        return tables.stream().map(TableResponse::from).toList();
    }

    /**
     * The types a table can be, with the labels to show for them.
     *
     * <p>Read-only and public, which is why it lives here rather than on the ADMIN-only
     * management endpoint: since Phase 7 the codes are data, so every screen that renders a
     * type — the booking grid, the diary filter, the telephone form — must look up its label
     * rather than hold a hardcoded map that a newly added type would be missing from.
     *
     * <p>Only active types. An inactive one still appears on the tables that carry it, but it
     * must not be offered as a choice, and this list is what fills the pickers.
     */
    @GetMapping("/types")
    public List<TableTypeView> types() {
        return tableTypeService.findActive().stream()
                .map(type -> new TableTypeView(type.getCode(), type.getLabel()))
                .toList();
    }

    /** Just enough to render a type: what it is called, and what to display. */
    public record TableTypeView(String code, String label) {}
}

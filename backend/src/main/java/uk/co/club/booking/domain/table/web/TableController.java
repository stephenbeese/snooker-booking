package uk.co.club.booking.domain.table.web;

import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uk.co.club.booking.domain.table.SnookerTable;
import uk.co.club.booking.domain.table.SnookerTableRepository;
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

    public TableController(SnookerTableRepository tableRepository) {
        this.tableRepository = tableRepository;
    }

    @GetMapping
    public List<TableResponse> list(@AuthenticationPrincipal AppUserPrincipal principal) {
        boolean isAdmin = principal != null && principal.isAdmin();
        List<SnookerTable> tables = isAdmin
                ? tableRepository.findAllByOrderByDisplayOrderAscIdAsc()
                : tableRepository.findAllByActiveTrueOrderByDisplayOrderAscIdAsc();
        return tables.stream().map(TableResponse::from).toList();
    }
}

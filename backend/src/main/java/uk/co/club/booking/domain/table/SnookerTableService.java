package uk.co.club.booking.domain.table;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uk.co.club.booking.common.error.BusinessRuleException;
import uk.co.club.booking.common.error.ErrorCode;
import uk.co.club.booking.common.error.NotFoundException;

/**
 * Managing the club's tables.
 *
 * <h2>Deactivate, never delete</h2>
 *
 * Every booking references the table it was played on, including bookings from years ago. A
 * deleted table would either break those rows or force them to be deleted too, destroying the
 * club's own history — and a customer ringing about a past booking could not be answered. The
 * {@code active} flag removes a table from sale while leaving the record intact.
 */
@Service
public class SnookerTableService {

    private static final Logger log = LoggerFactory.getLogger(SnookerTableService.class);

    private final SnookerTableRepository tableRepository;
    private final TableTypeService tableTypeService;

    public SnookerTableService(
            SnookerTableRepository tableRepository, TableTypeService tableTypeService) {
        this.tableRepository = tableRepository;
        this.tableTypeService = tableTypeService;
    }

    @Transactional(readOnly = true)
    public List<SnookerTable> findAll() {
        return tableRepository.findAllByOrderByDisplayOrderAscIdAsc();
    }

    @Transactional(readOnly = true)
    public SnookerTable require(long id) {
        return tableRepository
                .findById(id)
                .orElseThrow(() -> new NotFoundException(
                        ErrorCode.TABLE_NOT_FOUND, "That table does not exist."));
    }

    @Transactional
    public SnookerTable create(String name, String type, int displayOrder, String notes) {
        // Checked here rather than left to the V15 foreign key: a violated FK arrives as a
        // DataIntegrityViolationException and a 500, where this is a 422 naming the problem.
        tableTypeService.requireAssignable(type);
        SnookerTable table = new SnookerTable(name.trim(), type, displayOrder);
        table.setNotes(notes);
        return saveTranslatingDuplicateName(table);
    }

    /**
     * Renames, retypes or reorders a table.
     *
     * <p>Changing the type of a table with historic bookings is permitted: it reflects a real
     * change to the equipment, and the bookings remain accurate about what was booked.
     */
    @Transactional
    public SnookerTable update(
            long id, String name, String type, int displayOrder, String notes) {
        SnookerTable table = require(id);
        // Only when the type actually changes. A table already carrying a type that has since
        // been deactivated must stay editable — otherwise renaming it would be impossible
        // without first reactivating a type the club has deliberately withdrawn.
        if (!table.getTableType().equals(type)) {
            tableTypeService.requireAssignable(type);
        }
        table.setName(name.trim());
        table.setTableType(type);
        table.setDisplayOrder(displayOrder);
        table.setNotes(notes);
        return saveTranslatingDuplicateName(table);
    }

    /**
     * Rewrites the display order of every table in one go, from an ordered list of ids.
     *
     * <p>One transaction rather than a PUT per table: reordering by dragging produces a new
     * order for the whole list at once, and applying it one row at a time would leave the grid
     * visibly inconsistent between requests — and permanently inconsistent if one failed
     * halfway. {@code display_order} is not unique, so intermediate collisions are harmless;
     * the final positions are what matter.
     *
     * <p>The list must name every table. A partial list would silently leave the omitted ones
     * at whatever position they held, interleaved unpredictably with the new order, which is
     * far harder to diagnose than a refusal.
     */
    @Transactional
    public List<SnookerTable> reorder(List<Long> orderedIds) {
        List<SnookerTable> tables = tableRepository.findAllByOrderByDisplayOrderAscIdAsc();

        Set<Long> given = Set.copyOf(orderedIds);
        if (given.size() != orderedIds.size()) {
            throw new BusinessRuleException(
                    ErrorCode.VALIDATION_FAILED, "The same table was listed more than once.");
        }
        Set<Long> known = tables.stream().map(SnookerTable::getId).collect(Collectors.toSet());
        if (!given.equals(known)) {
            throw new BusinessRuleException(
                    ErrorCode.VALIDATION_FAILED,
                    "The new order must list every table exactly once.");
        }

        Map<Long, SnookerTable> byId =
                tables.stream().collect(Collectors.toMap(SnookerTable::getId, table -> table));
        for (int position = 0; position < orderedIds.size(); position++) {
            byId.get(orderedIds.get(position)).setDisplayOrder(position);
        }
        tableRepository.flush();
        log.info("Reordered {} tables", orderedIds.size());
        return tableRepository.findAllByOrderByDisplayOrderAscIdAsc();
    }

    /**
     * Takes a table off sale, or puts it back.
     *
     * <p>Existing bookings are deliberately left alone. Rules apply when a booking is made, and
     * retroactively cancelling somebody's Saturday game because a table was deactivated on
     * Thursday would be a worse outcome than staff dealing with those bookings explicitly. The
     * table stops appearing in availability immediately, so nothing new can be booked on it.
     */
    @Transactional
    public SnookerTable setActive(long id, boolean active) {
        SnookerTable table = require(id);
        table.setActive(active);
        log.info("Table {} set active={}", table.getName(), active);
        return tableRepository.saveAndFlush(table);
    }

    /**
     * Saves, turning the unique-name violation into a 422 rather than a 500.
     *
     * <p>{@code saveAndFlush} for the same reason as everywhere else in this codebase: a plain
     * save defers the INSERT to commit, outside this try block, and the violation would escape
     * as an unhandled error.
     */
    private SnookerTable saveTranslatingDuplicateName(SnookerTable table) {
        try {
            return tableRepository.saveAndFlush(table);
        } catch (DataIntegrityViolationException ex) {
            // The only unique constraint on this table is the name.
            throw new BusinessRuleException(
                    ErrorCode.CONFLICT, "A table called \"" + table.getName() + "\" already exists.");
        }
    }
}

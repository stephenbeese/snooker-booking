package uk.co.club.booking.domain.table;

import java.util.List;
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

    public SnookerTableService(SnookerTableRepository tableRepository) {
        this.tableRepository = tableRepository;
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
    public SnookerTable create(String name, TableType type, int displayOrder, String notes) {
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
            long id, String name, TableType type, int displayOrder, String notes) {
        SnookerTable table = require(id);
        table.setName(name.trim());
        table.setTableType(type);
        table.setDisplayOrder(displayOrder);
        table.setNotes(notes);
        return saveTranslatingDuplicateName(table);
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

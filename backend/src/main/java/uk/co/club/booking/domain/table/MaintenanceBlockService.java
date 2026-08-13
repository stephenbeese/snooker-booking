package uk.co.club.booking.domain.table;

import java.time.Instant;
import java.util.List;
import org.hibernate.exception.ConstraintViolationException;
import org.postgresql.util.PSQLException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uk.co.club.booking.common.error.BusinessRuleException;
import uk.co.club.booking.common.error.ErrorCode;
import uk.co.club.booking.common.error.NotFoundException;
import uk.co.club.booking.common.error.SlotTakenException;
import uk.co.club.booking.domain.booking.Booking;
import uk.co.club.booking.domain.booking.BookingRepository;
import uk.co.club.booking.domain.booking.BookingStatus;

/**
 * Maintenance blocks: taking a table out of service for a period.
 *
 * <h2>Why a block cannot simply be inserted</h2>
 *
 * A block and a booking are two promises about the same table at the same time, and only one
 * of them can be kept. The database cannot adjudicate this pair — an {@code EXCLUDE} constraint
 * works within one table, and these live in two — so the check happens here.
 *
 * <p>The refusal is deliberate rather than a courtesy. Silently accepting a block over a
 * confirmed booking would leave a customer holding a booking for a table that staff believe is
 * out of service; the conflict would only surface when they arrive. Staff are told which
 * bookings are in the way so they can cancel them explicitly — a decision with a customer at
 * the end of it, which belongs to the club and not to a default.
 */
@Service
public class MaintenanceBlockService {

    private static final Logger log = LoggerFactory.getLogger(MaintenanceBlockService.class);

    /** The EXCLUDE constraint in V9. Matched by name so no other failure is mistaken for it. */
    private static final String OVERLAP_CONSTRAINT = "maintenance_block_no_overlap";

    /** PostgreSQL SQLState for exclusion_violation. */
    private static final String EXCLUSION_VIOLATION_SQL_STATE = "23P01";

    private final MaintenanceBlockRepository blockRepository;
    private final SnookerTableRepository tableRepository;
    private final BookingRepository bookingRepository;

    public MaintenanceBlockService(
            MaintenanceBlockRepository blockRepository,
            SnookerTableRepository tableRepository,
            BookingRepository bookingRepository) {
        this.blockRepository = blockRepository;
        this.tableRepository = tableRepository;
        this.bookingRepository = bookingRepository;
    }

    @Transactional(readOnly = true)
    public List<MaintenanceBlock> findBetween(Instant from, Instant to) {
        return blockRepository.findOverlappingWithTable(from, to);
    }

    /**
     * Takes a table out of service for a period.
     *
     * @throws BusinessRuleException if live bookings already occupy the period
     * @throws SlotTakenException if another block covers it (409)
     */
    @Transactional
    public MaintenanceBlock create(
            long tableId, Instant startAt, Instant endAt, String reason, long actingUserId) {

        if (!endAt.isAfter(startAt)) {
            throw new BusinessRuleException(
                    ErrorCode.INVALID_REQUEST, "The end time must be after the start time.");
        }

        SnookerTable table = tableRepository
                .findById(tableId)
                .orElseThrow(() -> new NotFoundException(
                        ErrorCode.TABLE_NOT_FOUND, "That table does not exist."));

        requireNoLiveBookings(tableId, startAt, endAt);

        MaintenanceBlock block = new MaintenanceBlock(table, startAt, endAt, reason);
        block.setCreatedByUserId(actingUserId);
        try {
            // saveAndFlush, not save: a plain save defers the INSERT to commit, which happens
            // after this method returns, so the violation would escape as a 500 however
            // carefully it were caught here. Same reasoning as BookingService.
            return blockRepository.saveAndFlush(block);
        } catch (DataIntegrityViolationException ex) {
            if (OVERLAP_CONSTRAINT.equals(constraintNameOf(ex))) {
                throw new SlotTakenException(
                        "That table is already blocked for part of this period.");
            }
            throw ex;
        }
    }

    /** Puts a table back into service. The slot becomes bookable again immediately. */
    @Transactional
    public void delete(long blockId) {
        MaintenanceBlock block = blockRepository
                .findById(blockId)
                .orElseThrow(() -> new NotFoundException(
                        ErrorCode.NOT_FOUND, "That maintenance block does not exist."));
        blockRepository.delete(block);
        log.info("Maintenance block {} removed", blockId);
    }

    /**
     * Refuses a block that would cover bookings the club has already promised.
     *
     * <p>Only slot-occupying statuses count. A cancelled or expired booking in the period is
     * history, not a promise, and must not stop staff taking a table out of service.
     */
    private void requireNoLiveBookings(long tableId, Instant startAt, Instant endAt) {
        List<Booking> clashes = bookingRepository.findOverlappingForTable(
                tableId, startAt, endAt, BookingStatus.slotOccupying());
        if (clashes.isEmpty()) {
            return;
        }
        String references = clashes.stream().map(Booking::getReference).sorted().reduce(
                (a, b) -> a + ", " + b).orElse("");
        throw new BusinessRuleException(
                ErrorCode.CONFLICT,
                "This period already has bookings (" + references
                        + "). Cancel them first if the table must come out of service.");
    }

    /**
     * The constraint name behind a data-integrity failure.
     *
     * <p>Hibernate reports {@code null} for an <em>exclusion</em> violation — it reads the
     * driver's {@code constraint} field, which PostgreSQL populates for unique and foreign-key
     * violations but not for {@code EXCLUDE} — so the name has to be recovered from the server
     * message, and only when the SQLState confirms an exclusion violation. Identical reasoning
     * to {@code BookingService.constraintNameOf}.
     */
    private String constraintNameOf(DataIntegrityViolationException ex) {
        Throwable cause = ex.getCause();
        while (cause != null) {
            if (cause instanceof ConstraintViolationException violation
                    && violation.getConstraintName() != null) {
                return violation.getConstraintName();
            }
            cause = cause.getCause();
        }
        cause = ex.getCause();
        while (cause != null) {
            if (cause instanceof PSQLException psql && psql.getServerErrorMessage() != null) {
                String constraint = psql.getServerErrorMessage().getConstraint();
                if (constraint != null) {
                    return constraint;
                }
                if (EXCLUSION_VIOLATION_SQL_STATE.equals(psql.getSQLState())
                        && psql.getServerErrorMessage().getMessage() != null
                        && psql.getServerErrorMessage().getMessage().contains(OVERLAP_CONSTRAINT)) {
                    return OVERLAP_CONSTRAINT;
                }
            }
            cause = cause.getCause();
        }
        return null;
    }
}

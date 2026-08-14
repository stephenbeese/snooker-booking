package uk.co.club.booking.domain.table;

import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uk.co.club.booking.common.CodeFromLabel;
import uk.co.club.booking.common.error.BusinessRuleException;
import uk.co.club.booking.common.error.ErrorCode;
import uk.co.club.booking.common.error.NotFoundException;

/**
 * Managing the kinds of table the club holds.
 *
 * <p>These were a Java enum until Phase 7. Making them data lets a manager add Chinese pool or
 * darts without a deployment, which is the whole point — but it moves a guarantee the compiler
 * used to give into this class, so the rules below are the guarantee now.
 */
@Service
public class TableTypeService {

    private static final Logger log = LoggerFactory.getLogger(TableTypeService.class);

    private final TableTypeRepository typeRepository;
    private final SnookerTableRepository tableRepository;

    public TableTypeService(
            TableTypeRepository typeRepository, SnookerTableRepository tableRepository) {
        this.typeRepository = typeRepository;
        this.tableRepository = tableRepository;
    }

    @Transactional(readOnly = true)
    public List<TableTypeEntity> findAll() {
        return typeRepository.findAllByOrderByDisplayOrderAscCodeAsc();
    }

    /** The types something new may be given. Inactive ones stay readable but unassignable. */
    @Transactional(readOnly = true)
    public List<TableTypeEntity> findActive() {
        return typeRepository.findByActiveTrueOrderByDisplayOrderAscCodeAsc();
    }

    @Transactional(readOnly = true)
    public TableTypeEntity require(String code) {
        return typeRepository
                .findById(code)
                .orElseThrow(() -> new NotFoundException(
                        ErrorCode.NOT_FOUND, "That table type does not exist."));
    }

    /**
     * Adds a type.
     *
     * <p>The code is derived from the label rather than typed separately: staff are naming a kind
     * of table, not choosing an identifier, and a form with both invites codes that disagree with
     * their labels. Derivation is one-way and happens once — renaming the label later leaves the
     * code alone, because tables and pricing rules already reference it.
     */
    @Transactional
    public TableTypeEntity create(String label, Integer displayOrder) {
        String trimmed = label == null ? "" : label.trim();
        if (trimmed.isEmpty()) {
            throw new BusinessRuleException(
                    ErrorCode.VALIDATION_FAILED, "Give the table type a name.");
        }

        String code = toCode(trimmed);
        if (code.isEmpty()) {
            // Reachable for a label of only punctuation or non-Latin script, which would
            // otherwise produce an empty primary key and a 500 from the CHECK.
            throw new BusinessRuleException(
                    ErrorCode.VALIDATION_FAILED,
                    "That name cannot be used; it needs at least one letter or digit.");
        }
        if (typeRepository.existsById(code)) {
            throw new BusinessRuleException(
                    ErrorCode.CONFLICT, "A table type called \"" + trimmed + "\" already exists.");
        }

        int order = displayOrder != null ? displayOrder : nextDisplayOrder();
        TableTypeEntity created = typeRepository.saveAndFlush(
                new TableTypeEntity(code, trimmed, order));
        log.info("Table type {} created", code);
        return created;
    }

    /** Renames or reorders a type. The code is deliberately not editable — see the entity. */
    @Transactional
    public TableTypeEntity update(String code, String label, Integer displayOrder) {
        TableTypeEntity type = require(code);
        String trimmed = label == null ? "" : label.trim();
        if (trimmed.isEmpty()) {
            throw new BusinessRuleException(
                    ErrorCode.VALIDATION_FAILED, "Give the table type a name.");
        }
        type.setLabel(trimmed);
        if (displayOrder != null) {
            type.setDisplayOrder(displayOrder);
        }
        return typeRepository.saveAndFlush(type);
    }

    /**
     * Takes a type off the list of choices, or puts it back.
     *
     * <p>Deactivating is refused while any table still has the type. The foreign key would
     * permit it — the row survives — but the effect would be a table whose type is no longer
     * offered anywhere, which staff can neither see the reason for nor fix without first
     * guessing that the type was deactivated. Refusing names the problem instead.
     *
     * <p>Existing pricing rules are deliberately <em>not</em> checked. A rule for a type no
     * longer in use simply stops matching, which is the correct outcome and costs nothing; a
     * table with no offered type is a live inconsistency.
     */
    @Transactional
    public TableTypeEntity setActive(String code, boolean active) {
        TableTypeEntity type = require(code);
        if (!active) {
            long inUse = tableRepository.countByTableType(code);
            if (inUse > 0) {
                throw new BusinessRuleException(
                        ErrorCode.CONFLICT,
                        "There "
                                + (inUse == 1 ? "is 1 table" : "are " + inUse + " tables")
                                + " of this type. Change "
                                + (inUse == 1 ? "it" : "them")
                                + " to another type first.");
            }
        }
        type.setActive(active);
        log.info("Table type {} set active={}", code, active);
        return typeRepository.saveAndFlush(type);
    }

    /** Rejects a type that does not exist, or exists but is no longer offered. */
    @Transactional(readOnly = true)
    public void requireAssignable(String code) {
        if (!typeRepository.existsByCodeAndActiveTrue(code)) {
            throw new BusinessRuleException(
                    ErrorCode.VALIDATION_FAILED, "That table type is not available.");
        }
    }

    /** Appends rather than colliding, so a new type lands at the end of the list. */
    private int nextDisplayOrder() {
        return findAll().stream().mapToInt(TableTypeEntity::getDisplayOrder).max().orElse(-1) + 1;
    }

    /** "Chinese pool" becomes CHINESE_POOL. Shared with cafe categories — see the helper. */
    private static String toCode(String label) {
        return CodeFromLabel.derive(label);
    }
}

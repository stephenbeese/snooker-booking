package uk.co.club.booking.domain.cafe;

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
 * The sections of the cafe and bar menu.
 *
 * <p>Follows {@code TableTypeService} deliberately, down to the code derivation they now share:
 * both are small admin-managed catalogues referenced by code from another table, and inventing a
 * second pattern for the same problem would mean two sets of rules to keep in step.
 */
@Service
public class CafeCategoryService {

    private static final Logger log = LoggerFactory.getLogger(CafeCategoryService.class);

    private final CafeCategoryRepository categoryRepository;
    private final CafeItemRepository itemRepository;

    public CafeCategoryService(
            CafeCategoryRepository categoryRepository, CafeItemRepository itemRepository) {
        this.categoryRepository = categoryRepository;
        this.itemRepository = itemRepository;
    }

    @Transactional(readOnly = true)
    public List<CafeCategory> findAll() {
        return categoryRepository.findAllByOrderByDisplayOrderAscCodeAsc();
    }

    /** The categories an item may be given. Withdrawn ones stay readable but unassignable. */
    @Transactional(readOnly = true)
    public List<CafeCategory> findActive() {
        return categoryRepository.findByActiveTrueOrderByDisplayOrderAscCodeAsc();
    }

    @Transactional(readOnly = true)
    public CafeCategory require(String code) {
        return categoryRepository
                .findById(code)
                .orElseThrow(() -> new NotFoundException(
                        ErrorCode.NOT_FOUND, "That menu category does not exist."));
    }

    /**
     * Adds a category.
     *
     * <p>The code is derived from the label rather than typed separately: staff are naming a
     * section of the menu, not choosing an identifier. Derivation happens once — renaming the
     * label later leaves the code alone, because items already reference it.
     */
    @Transactional
    public CafeCategory create(String label, Integer displayOrder) {
        String trimmed = label == null ? "" : label.trim();
        if (trimmed.isEmpty()) {
            throw new BusinessRuleException(
                    ErrorCode.VALIDATION_FAILED, "Give the category a name.");
        }

        String code = CodeFromLabel.derive(trimmed);
        if (code.isEmpty()) {
            // Reachable for a label of only punctuation or non-Latin script, which would
            // otherwise produce an empty primary key and a 500 from the CHECK.
            throw new BusinessRuleException(
                    ErrorCode.VALIDATION_FAILED,
                    "That name cannot be used; it needs at least one letter or digit.");
        }
        if (categoryRepository.existsById(code)) {
            throw new BusinessRuleException(
                    ErrorCode.CONFLICT, "A category called \"" + trimmed + "\" already exists.");
        }

        int order = displayOrder != null ? displayOrder : nextDisplayOrder();
        CafeCategory created =
                categoryRepository.saveAndFlush(new CafeCategory(code, trimmed, order));
        log.info("Cafe category {} created", code);
        return created;
    }

    /** Renames or reorders. The code is deliberately not editable — see the entity. */
    @Transactional
    public CafeCategory update(String code, String label, Integer displayOrder) {
        CafeCategory category = require(code);
        String trimmed = label == null ? "" : label.trim();
        if (trimmed.isEmpty()) {
            throw new BusinessRuleException(
                    ErrorCode.VALIDATION_FAILED, "Give the category a name.");
        }
        category.setLabel(trimmed);
        if (displayOrder != null) {
            category.setDisplayOrder(displayOrder);
        }
        return categoryRepository.saveAndFlush(category);
    }

    /**
     * Takes a category off the list of choices, or puts it back.
     *
     * <p>Refused while any item still carries it. The foreign key would permit it — the row
     * survives — but the effect would be items filed under a section no longer offered anywhere,
     * which staff can neither see the reason for nor fix without first guessing that the category
     * was withdrawn. Refusing names the problem instead, exactly as table types do.
     */
    @Transactional
    public CafeCategory setActive(String code, boolean active) {
        CafeCategory category = require(code);
        if (!active) {
            long inUse = itemRepository.countByCategoryCode(code);
            if (inUse > 0) {
                throw new BusinessRuleException(
                        ErrorCode.CONFLICT,
                        "There "
                                + (inUse == 1 ? "is 1 item" : "are " + inUse + " items")
                                + " in this category. Move "
                                + (inUse == 1 ? "it" : "them")
                                + " elsewhere first.");
            }
        }
        category.setActive(active);
        log.info("Cafe category {} set active={}", code, active);
        return categoryRepository.saveAndFlush(category);
    }

    /** Rejects a category that does not exist, or exists but is no longer offered. */
    @Transactional(readOnly = true)
    public void requireAssignable(String code) {
        if (!categoryRepository.existsByCodeAndActiveTrue(code)) {
            throw new BusinessRuleException(
                    ErrorCode.VALIDATION_FAILED, "That menu category is not available.");
        }
    }

    /** Appends rather than colliding, so a new category lands at the end of the list. */
    private int nextDisplayOrder() {
        return findAll().stream().mapToInt(CafeCategory::getDisplayOrder).max().orElse(-1) + 1;
    }
}

package uk.co.club.booking.domain.cafe;

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
 * The cafe and bar menu.
 *
 * <p>Plain CRUD over a priced list, following {@code SnookerTableService}: deactivate rather than
 * delete, unique names translated to a 422, and money in integer pence throughout.
 *
 * <p>There is deliberately no bill, no stock count and no till. Those need decisions nobody has
 * made — how a bill attaches to a table, who may void a line, what happens to an unpaid tab at
 * closing — and inventing them here would bake guesses into a schema. What exists is the part
 * that is unambiguous: the menu itself.
 */
@Service
public class CafeItemService {

    private static final Logger log = LoggerFactory.getLogger(CafeItemService.class);

    private final CafeItemRepository itemRepository;

    public CafeItemService(CafeItemRepository itemRepository) {
        this.itemRepository = itemRepository;
    }

    /** Every item, including withdrawn ones — staff need to see what they have taken off. */
    @Transactional(readOnly = true)
    public List<CafeItem> findAll() {
        return itemRepository.findAllByOrderByDisplayOrderAscIdAsc();
    }

    @Transactional(readOnly = true)
    public CafeItem require(long id) {
        return itemRepository
                .findById(id)
                .orElseThrow(() -> new NotFoundException(
                        ErrorCode.NOT_FOUND, "That menu item does not exist."));
    }

    @Transactional
    public CafeItem create(
            String name,
            String description,
            int pricePence,
            String imageUrl,
            Integer displayOrder) {
        String trimmedName = requireName(name);
        requirePrice(pricePence);

        // Appends rather than colliding at 0, so a new item lands at the end of the menu instead
        // of silently sharing a position with whatever is already first.
        int order = displayOrder != null ? displayOrder : nextDisplayOrder();
        CafeItem item = new CafeItem(trimmedName, pricePence, order);
        item.setDescription(blankToNull(description));
        item.setImageUrl(blankToNull(imageUrl));

        CafeItem created = saveTranslatingDuplicateName(item);
        log.info("Cafe item {} created", created.getId());
        return created;
    }

    @Transactional
    public CafeItem update(
            long id,
            String name,
            String description,
            int pricePence,
            String imageUrl,
            Integer displayOrder) {
        CafeItem item = require(id);
        item.setName(requireName(name));
        requirePrice(pricePence);
        item.setPricePence(pricePence);
        item.setDescription(blankToNull(description));
        item.setImageUrl(blankToNull(imageUrl));
        if (displayOrder != null) {
            item.setDisplayOrder(displayOrder);
        }
        return saveTranslatingDuplicateName(item);
    }

    /**
     * Takes an item off the menu, or puts it back.
     *
     * <p>Separate from {@link #update} so withdrawing something is always a deliberate act rather
     * than a side effect of correcting a price.
     */
    @Transactional
    public CafeItem setActive(long id, boolean active) {
        CafeItem item = require(id);
        item.setActive(active);
        log.info("Cafe item {} set active={}", item.getId(), active);
        return itemRepository.saveAndFlush(item);
    }

    /**
     * Checked here as well as by the CHECK constraint.
     *
     * <p>The constraint would catch a negative price, but as a {@code DataIntegrityViolation} and
     * a 500. This is a 422 that names the field.
     */
    private static void requirePrice(int pricePence) {
        if (pricePence < 0) {
            throw new BusinessRuleException(
                    ErrorCode.VALIDATION_FAILED, "A price cannot be negative.");
        }
    }

    private static String requireName(String name) {
        String trimmed = name == null ? "" : name.trim();
        if (trimmed.isEmpty()) {
            throw new BusinessRuleException(ErrorCode.VALIDATION_FAILED, "Give the item a name.");
        }
        return trimmed;
    }

    /**
     * An empty optional field is stored as NULL rather than "".
     *
     * <p>Otherwise "no description" has two representations, and every reader has to test for
     * both — the sort of thing that gets remembered in one place and forgotten in the next.
     */
    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private int nextDisplayOrder() {
        return findAll().stream().mapToInt(CafeItem::getDisplayOrder).max().orElse(-1) + 1;
    }

    /**
     * Saves, turning the unique-name violation into a 422 rather than a 500.
     *
     * <p>{@code saveAndFlush} for the same reason as everywhere else here: a plain save defers the
     * INSERT to commit, outside this try block, and the violation would escape unhandled.
     */
    private CafeItem saveTranslatingDuplicateName(CafeItem item) {
        try {
            return itemRepository.saveAndFlush(item);
        } catch (DataIntegrityViolationException ex) {
            // The only unique constraint on this table is the name.
            throw new BusinessRuleException(
                    ErrorCode.CONFLICT, "\"" + item.getName() + "\" is already on the menu.");
        }
    }
}

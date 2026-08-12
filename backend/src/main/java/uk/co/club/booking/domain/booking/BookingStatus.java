package uk.co.club.booking.domain.booking;

import java.util.EnumSet;
import java.util.Set;

/**
 * Lifecycle of the slot reservation. Kept deliberately distinct from payment status:
 * the slot and the money have independent lifecycles.
 */
public enum BookingStatus {

    /** Slot held while the customer pays. Reserves the slot; carries a hold expiry. */
    PENDING_PAYMENT,

    /** Slot committed. */
    CONFIRMED,

    /** Released by the customer or an admin. */
    CANCELLED,

    /**
     * Hold lapsed without payment. Distinct from CANCELLED so abandonment never shows
     * up in a customer's cancellation history and can be measured separately.
     */
    EXPIRED,

    /** Session took place. */
    COMPLETED,

    /** Customer did not turn up. */
    NO_SHOW;

    /**
     * Statuses that occupy their slot. Must match the partial predicate of the
     * booking_no_overlap constraint in V8 exactly — any drift produces "the grid said
     * it was free" bugs.
     */
    private static final Set<BookingStatus> SLOT_OCCUPYING =
            EnumSet.of(PENDING_PAYMENT, CONFIRMED, COMPLETED, NO_SHOW);

    public boolean occupiesSlot() {
        return SLOT_OCCUPYING.contains(this);
    }

    public static Set<BookingStatus> slotOccupying() {
        return SLOT_OCCUPYING;
    }

    /** Terminal states that no further transition may leave. */
    public boolean isTerminal() {
        return this == CANCELLED || this == EXPIRED || this == COMPLETED || this == NO_SHOW;
    }
}

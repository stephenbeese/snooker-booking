package uk.co.club.booking.domain.availability;

/**
 * Why a slot cannot be booked. Exposed to the client so the grid can explain itself
 * (styling and tooltips) instead of showing an unexplained grey cell.
 */
public enum UnavailableReason {

    /** Outside the club's opening hours for that weekday. */
    CLUB_CLOSED,

    /** Table is deactivated — the whole row is unavailable. */
    TABLE_INACTIVE,

    /** A maintenance block covers the slot. */
    MAINTENANCE,

    /** An active booking or a live payment hold covers the slot. */
    BOOKED,

    /** The slot has already started. */
    PAST,

    /** In the future, but inside the configured minimum notice period. */
    INSUFFICIENT_NOTICE,

    /** Beyond the configured maximum advance-booking window. */
    TOO_FAR_IN_ADVANCE,

    /**
     * The slot itself is free, but no permitted booking duration fits before closing
     * time or the next unavailable slot. Distinct from BOOKED: the cell is not
     * occupied, it just cannot be a starting point.
     */
    INSUFFICIENT_REMAINING_TIME
}

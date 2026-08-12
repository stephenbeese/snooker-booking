package uk.co.club.booking.common.error;

/**
 * Machine-readable error codes. The frontend switches on these rather than parsing
 * human-readable messages, which are free to change.
 */
public enum ErrorCode {

    // Validation / malformed input
    VALIDATION_FAILED,
    INVALID_REQUEST,

    // Booking rules
    CLUB_CLOSED,
    TABLE_NOT_FOUND,
    TABLE_INACTIVE,
    TABLE_UNDER_MAINTENANCE,
    INVALID_DURATION,
    INSUFFICIENT_NOTICE,
    TOO_FAR_IN_ADVANCE,

    /** Lost the race for a slot. Prompts the client to refetch availability. */
    SLOT_UNAVAILABLE,

    // Cancellation
    CANCELLATION_TOO_LATE,
    BOOKING_NOT_CANCELLABLE,

    // Auth
    AUTHENTICATION_REQUIRED,
    ACCESS_DENIED,

    // Generic
    NOT_FOUND,
    CONFLICT,
    UNEXPECTED_ERROR
}

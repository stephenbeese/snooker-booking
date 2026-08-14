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
    /** Cancelled, expired or already played. There is nothing left to move. */
    BOOKING_NOT_AMENDABLE,

    // Auth
    AUTHENTICATION_REQUIRED,
    ACCESS_DENIED,
    /** Deliberately covers both "no such account" and "wrong password" — see AuthController. */
    INVALID_CREDENTIALS,
    ACCOUNT_DISABLED,
    EMAIL_ALREADY_REGISTERED,

    // Payment
    PAYMENT_NOT_REQUIRED,
    PAYMENT_PROVIDER_ERROR,
    /** Settled outside the provider — counter cash or a waiver — so there is nothing to send
     * back through it. */
    PAYMENT_NOT_REFUNDABLE,
    /** A decision someone has already made. Refused rather than repeated, because a double
     * click is likelier than a genuine retry. */
    PAYMENT_ALREADY_SETTLED,

    // Generic
    NOT_FOUND,
    CONFLICT,
    /** Throttled by RateLimitFilter. The response carries a Retry-After header. */
    TOO_MANY_REQUESTS,
    UNEXPECTED_ERROR
}

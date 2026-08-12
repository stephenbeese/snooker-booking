package uk.co.club.booking.domain.table;

/** Kinds of table the club can hold. Persisted as TEXT with a CHECK constraint. */
public enum TableType {
    SNOOKER,
    ENGLISH_POOL,
    AMERICAN_POOL
}

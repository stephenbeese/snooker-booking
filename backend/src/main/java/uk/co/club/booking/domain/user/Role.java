package uk.co.club.booking.domain.user;

/**
 * Who someone is to the club. Deliberately three named roles rather than a permission
 * system: a single club has customers, the people who work the counter, and whoever
 * configures the place. Inventing a grantable-permission model for three roles is the
 * kind of abstraction that outlives its usefulness.
 *
 * <p>Stored as TEXT with a CHECK constraint (V2, widened in V13) rather than a Postgres
 * ENUM, so adding a role is a one-line migration rather than a type rewrite.
 */
public enum Role {

    /** Books and manages their own tables, and nobody else's. */
    CUSTOMER,

    /**
     * Works the club: takes telephone bookings, cancels and amends anyone's booking, marks
     * tables out for maintenance. Cannot change the club's configuration — opening hours,
     * pricing, the tables themselves, or who else has access.
     */
    STAFF,

    /** Everything STAFF can do, plus the club's configuration and its user accounts. */
    ADMIN;

    /**
     * Does this role work here?
     *
     * <p>The distinction that matters at almost every call site. Cancelling someone else's
     * booking, seeing an out-of-service table, bypassing the cancellation notice period —
     * these are all "does this person work here", not "is this person the owner". Asking
     * {@code role == ADMIN} for them silently denied STAFF the things the role exists to
     * permit.
     */
    public boolean isStaff() {
        return this != CUSTOMER;
    }

    /** Only for the genuinely admin-only: club settings, pricing, tables, user accounts. */
    public boolean isAdmin() {
        return this == ADMIN;
    }

    /**
     * Spring Security authority name. The {@code ROLE_} prefix is what
     * {@code hasRole("ADMIN")} expects to find; {@code hasAuthority} would need the
     * prefix spelled out at every call site.
     */
    public String authority() {
        return "ROLE_" + name();
    }
}

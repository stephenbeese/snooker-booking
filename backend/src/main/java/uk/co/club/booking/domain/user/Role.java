package uk.co.club.booking.domain.user;

/**
 * Two roles only. Deliberately not a permission system: a single club has staff and
 * customers, and inventing a role hierarchy for two roles is the kind of abstraction
 * that outlives its usefulness.
 *
 * <p>Stored as TEXT with a CHECK constraint (V2) rather than a Postgres ENUM, so adding
 * a role later is a one-line migration.
 */
public enum Role {
    CUSTOMER,
    ADMIN;

    /**
     * Spring Security authority name. The {@code ROLE_} prefix is what
     * {@code hasRole("ADMIN")} expects to find; {@code hasAuthority} would need the
     * prefix spelled out at every call site.
     */
    public String authority() {
        return "ROLE_" + name();
    }
}

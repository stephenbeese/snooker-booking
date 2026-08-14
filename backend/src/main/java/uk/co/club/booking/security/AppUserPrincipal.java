package uk.co.club.booking.security;

import java.io.Serializable;
import java.util.Collection;
import java.util.List;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import uk.co.club.booking.domain.user.Role;
import uk.co.club.booking.domain.user.User;

/**
 * The authenticated principal, carrying the user id.
 *
 * <p>Spring's default {@code UserDetails} exposes only the username, which would force
 * an email lookup on every authorisation check ("is this your booking?"). Carrying the
 * id makes ownership checks a comparison rather than a query.
 *
 * <p>Serialisable because sessions are persisted to Postgres by Spring Session — the
 * whole principal is written to {@code spring_session_attributes}, so it must stay small
 * and must not hold a JPA entity (a lazy proxy would fail to deserialise).
 */
public class AppUserPrincipal implements UserDetails, Serializable {

    private static final long serialVersionUID = 1L;

    private final long id;
    private final String email;
    private final String passwordHash;
    private final String fullName;
    private final Role role;
    private final boolean active;

    public AppUserPrincipal(User user) {
        this.id = user.getId();
        this.email = user.getEmail();
        this.passwordHash = user.getPasswordHash();
        this.fullName = user.fullName();
        this.role = user.getRole();
        this.active = user.isActive();
    }

    public long id() {
        return id;
    }

    public String email() {
        return email;
    }

    public String fullName() {
        return fullName;
    }

    public Role role() {
        return role;
    }

    /**
     * Does this person work here?
     *
     * <p>Named for what its callers actually ask. This was {@code isAdmin()} when ADMIN was
     * the only staff role, and every call site — cancelling someone else's booking, bypassing
     * the cancellation notice period, seeing an out-of-service table — meant "is staff" rather
     * than "is the owner". Leaving the old name would have made one boolean mean two things
     * and quietly denied STAFF the things the role was added to permit.
     */
    public boolean isStaff() {
        return role.isStaff();
    }

    /** Reserved for the genuinely admin-only. Authorisation for those lives in the filter
     * chain; this exists for the few places that must tell the two staff roles apart. */
    public boolean isAdmin() {
        return role.isAdmin();
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority(role.authority()));
    }

    @Override
    public String getPassword() {
        return passwordHash;
    }

    @Override
    public String getUsername() {
        return email;
    }

    @Override
    public boolean isEnabled() {
        return active;
    }

    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        return true;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }
}

package uk.co.club.booking.domain.admin.web.dto;

import java.time.Instant;
import uk.co.club.booking.domain.user.Role;
import uk.co.club.booking.domain.user.User;

/**
 * An account as an admin sees it.
 *
 * <p>A record built by hand rather than the {@code User} entity serialised directly, for the
 * reason that matters most here: {@code User} holds {@code passwordHash}, and returning the
 * entity would put every account's hash on the wire the moment someone opens the user list.
 * Listing the fields explicitly makes that leak impossible rather than one {@code @JsonIgnore}
 * away from happening.
 */
public record AdminUserResponse(
        long id,
        String email,
        String firstName,
        String lastName,
        String fullName,
        String phone,
        Role role,
        boolean active,
        Instant createdAt) {

    public static AdminUserResponse from(User user) {
        return new AdminUserResponse(
                user.getId(),
                user.getEmail(),
                user.getFirstName(),
                user.getLastName(),
                user.fullName(),
                user.getPhone(),
                user.getRole(),
                user.isActive(),
                user.getCreatedAt());
    }
}

package uk.co.club.booking.domain.user.web.dto;

import uk.co.club.booking.domain.user.Role;
import uk.co.club.booking.domain.user.User;

/**
 * The current user, as the SPA needs them. Notably absent: the password hash, and
 * anything else the client has no use for.
 */
public record UserResponse(
        long id, String email, String firstName, String lastName, String phone, Role role) {

    public static UserResponse from(User user) {
        return new UserResponse(
                user.getId(),
                user.getEmail(),
                user.getFirstName(),
                user.getLastName(),
                user.getPhone(),
                user.getRole());
    }
}

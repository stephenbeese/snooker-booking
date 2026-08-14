package uk.co.club.booking.domain.admin.web.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import uk.co.club.booking.domain.user.Role;

/**
 * What an admin may send when managing accounts.
 *
 * <p>Every constraint here deliberately mirrors {@code RegisterRequest}. The 12–72 byte
 * password bound in particular is not arbitrary: BCrypt silently truncates beyond 72 bytes,
 * so allowing more would make two different long passwords interchangeable. A staff account
 * held to a weaker standard than a customer's would be exactly backwards — these are the
 * accounts that can cancel other people's bookings.
 */
public final class AdminUserRequests {

    private AdminUserRequests() {}

    /**
     * Creating an account for someone who works here.
     *
     * <p>Unlike {@code RegisterRequest}, this one carries a role — that is the whole point,
     * and it is why the endpoint behind it is ADMIN-only. The public registration DTO still
     * has no role field at all, so a customer cannot escalate by crafting a body.
     */
    public record CreateUserRequest(
            @NotBlank @Email @Size(max = 254) String email,
            @NotBlank @Size(min = 12, max = 72, message = "must be between 12 and 72 characters")
                    String password,
            @NotBlank @Size(max = 100) String firstName,
            @NotBlank @Size(max = 100) String lastName,
            @Pattern(
                            regexp = "^$|^[0-9 +()-]{7,20}$",
                            message = "must be a valid telephone number")
                    String phone,
            @NotNull Role role) {}

    /** Promoting or demoting an existing account. */
    public record ChangeRoleRequest(@NotNull Role role) {}

    /** Setting a password on someone else's behalf, when they have lost theirs. */
    public record ResetPasswordRequest(
            @NotBlank @Size(min = 12, max = 72, message = "must be between 12 and 72 characters")
                    String password) {}
}

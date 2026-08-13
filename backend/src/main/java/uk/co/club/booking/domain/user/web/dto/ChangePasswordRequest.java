package uk.co.club.booking.domain.user.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * @param currentPassword proves the person at the keyboard is the account holder, not merely
 *     someone holding a live session
 * @param newPassword 12–72 characters. The upper bound is not cosmetic: BCrypt silently
 *     truncates beyond 72 bytes, which would make two different long passwords interchangeable.
 */
public record ChangePasswordRequest(
        @NotBlank String currentPassword,
        @NotBlank @Size(min = 12, max = 72, message = "Use between 12 and 72 characters")
                String newPassword) {}

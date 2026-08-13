package uk.co.club.booking.domain.user.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ResetPasswordRequest(
        @NotBlank String token,
        // Same bounds as registration. 72 because BCrypt silently truncates past that, which
        // would make two different long passwords interchangeable.
        @NotBlank @Size(min = 12, max = 72, message = "Use between 12 and 72 characters")
                String newPassword) {}

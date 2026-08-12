package uk.co.club.booking.domain.user.web.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Registration input. Always creates a CUSTOMER — the role is deliberately absent so no
 * request body can ever mint an admin.
 */
public record RegisterRequest(
        @NotBlank @Email @Size(max = 254) String email,

        // 12 chars minimum with no composition rules: length beats character-class
        // requirements, which mostly produce "Password1!" and a sticky note. The upper
        // bound exists because BCrypt silently truncates beyond 72 bytes, which would
        // make two different long passwords interchangeable.
        @NotBlank @Size(min = 12, max = 72, message = "must be between 12 and 72 characters")
                String password,
        @NotBlank @Size(max = 100) String firstName,
        @NotBlank @Size(max = 100) String lastName,
        @Pattern(
                        regexp = "^$|^[0-9 +()-]{7,20}$",
                        message = "must be a valid telephone number")
                String phone) {}

package uk.co.club.booking.domain.user.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * The details a customer may change about themselves.
 *
 * <p>No email and no role field. Both are omitted rather than validated-and-rejected, so
 * changing them through this endpoint is unrepresentable instead of merely forbidden — the
 * same reasoning as {@link RegisterRequest}.
 */
public record UpdateProfileRequest(
        @NotBlank @Size(max = 100) String firstName,
        @NotBlank @Size(max = 100) String lastName,
        // Permissive on purpose: real phone numbers carry spaces, brackets and country codes,
        // and a strict pattern rejects valid numbers far more often than it catches typos.
        @Pattern(regexp = "^$|^[0-9 +()-]{7,20}$", message = "Enter a valid phone number")
                String phone) {}

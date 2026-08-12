package uk.co.club.booking.domain.user.web.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * Login input.
 *
 * <p>No {@code @Email} or length constraints: a malformed email should fail
 * authentication with the same generic error as a wrong password, not with a field-level
 * validation message that confirms the format was the only problem.
 */
public record LoginRequest(@NotBlank String email, @NotBlank String password) {}

package uk.co.club.booking.domain.user.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * @param email deliberately not {@code @Email}-validated. A format error would answer
 *     differently from a well-formed unknown address, which is the account-enumeration leak this
 *     endpoint exists to avoid. Anything unparseable simply matches no account.
 */
public record ForgotPasswordRequest(@NotBlank @Size(max = 254) String email) {}

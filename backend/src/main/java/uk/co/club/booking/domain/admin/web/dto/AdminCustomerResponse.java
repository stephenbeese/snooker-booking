package uk.co.club.booking.domain.admin.web.dto;

import java.time.Instant;
import uk.co.club.booking.domain.user.User;

/**
 * A customer as the counter sees them.
 *
 * <p>Fields named explicitly rather than serialising {@code User}, for the same reason
 * {@link AdminUserResponse} does it: the entity holds {@code passwordHash}, and returning it
 * would put every customer's hash on the wire. Listing the fields makes that impossible instead
 * of one forgotten annotation away.
 *
 * <p>No role field. Everything this endpoint returns is a customer by construction, so a role
 * on the response would be a constant dressed up as data.
 *
 * @param bookingCount how many bookings this customer has ever had, of any status
 */
public record AdminCustomerResponse(
        long id,
        String email,
        String firstName,
        String lastName,
        String fullName,
        String phone,
        boolean active,
        Instant createdAt,
        long bookingCount) {

    public static AdminCustomerResponse from(User user, long bookingCount) {
        return new AdminCustomerResponse(
                user.getId(),
                user.getEmail(),
                user.getFirstName(),
                user.getLastName(),
                user.fullName(),
                user.getPhone(),
                user.isActive(),
                user.getCreatedAt(),
                bookingCount);
    }
}

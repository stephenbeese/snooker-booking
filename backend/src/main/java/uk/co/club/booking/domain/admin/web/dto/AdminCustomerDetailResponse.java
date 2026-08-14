package uk.co.club.booking.domain.admin.web.dto;

import java.util.List;

/**
 * One customer and their bookings, for the record staff open when someone rings up.
 *
 * <p>The bookings come back on the same response rather than from a second request. Staff open
 * this screen to answer "when are they in next" — a customer with no bookings beside them is a
 * screen that has not yet answered the question it was opened for.
 *
 * @param customer the account, without the booking count the list view carries — the bookings
 *     themselves are right here, so a count of them would be a second copy of the same fact
 */
public record AdminCustomerDetailResponse(
        AdminCustomerResponse customer, List<AdminBookingResponse> bookings) {}

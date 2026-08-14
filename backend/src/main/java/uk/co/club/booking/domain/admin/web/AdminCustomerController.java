package uk.co.club.booking.domain.admin.web;

import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uk.co.club.booking.domain.admin.AdminCustomerService;
import uk.co.club.booking.domain.admin.web.dto.AdminCustomerDetailResponse;
import uk.co.club.booking.domain.admin.web.dto.AdminCustomerResponse;
import uk.co.club.booking.domain.admin.web.dto.PagedResponse;
import uk.co.club.booking.domain.booking.Booking;
import uk.co.club.booking.domain.user.User;

/**
 * Looking a customer up, for whoever is on the counter.
 *
 * <p>STAFF-reachable, by falling under the {@code /api/admin/**} rule in {@code SecurityConfig}
 * rather than the narrower ADMIN list above it. That is the whole reason this is not part of
 * {@code AdminUserController}: that path is ADMIN-only because it grants roles and resets other
 * people's passwords, and hanging {@code ?role=CUSTOMER} off it would have forced a choice
 * between refusing staff a lookup they need all day and opening the account directory to them.
 *
 * <p>Read-only by design. Editing a customer's details is the account holder's own job through
 * their profile, and correcting one from here would be a second write path onto the same row
 * with none of the rules the profile endpoint applies.
 */
@RestController
@RequestMapping("/api/admin/customers")
public class AdminCustomerController {

    private final AdminCustomerService adminCustomerService;
    private final AdminBookingMapper bookingMapper;

    public AdminCustomerController(
            AdminCustomerService adminCustomerService, AdminBookingMapper bookingMapper) {
        this.adminCustomerService = adminCustomerService;
        this.bookingMapper = bookingMapper;
    }

    /**
     * The customer directory, searched and paged.
     *
     * @param search optional; matches email, first name, last name or full name
     */
    @GetMapping
    public PagedResponse<AdminCustomerResponse> list(
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size) {

        return PagedResponse.ofAll(
                adminCustomerService.search(search, page, size), this::withBookingCounts);
    }

    /** One customer and their bookings, newest first. */
    @GetMapping("/{id}")
    public AdminCustomerDetailResponse byId(@PathVariable long id) {
        User customer = adminCustomerService.require(id);
        List<Booking> bookings = adminCustomerService.bookingsFor(id);
        return new AdminCustomerDetailResponse(
                AdminCustomerResponse.from(customer, bookings.size()),
                bookingMapper.many(bookings));
    }

    /**
     * Attaches each customer's booking count, counted for the whole page in one query.
     *
     * <p>Mapped a page at a time rather than a row at a time for the same reason the booking
     * list is: a count per row would be 25 extra queries every time staff open this screen.
     */
    private List<AdminCustomerResponse> withBookingCounts(List<User> customers) {
        Map<Long, Long> counts = adminCustomerService.bookingCounts(customers);
        return customers.stream()
                .map(customer -> AdminCustomerResponse.from(
                        customer, counts.getOrDefault(customer.getId(), 0L)))
                .toList();
    }
}

package uk.co.club.booking.domain.admin;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uk.co.club.booking.common.error.ErrorCode;
import uk.co.club.booking.common.error.NotFoundException;
import uk.co.club.booking.domain.booking.Booking;
import uk.co.club.booking.domain.booking.BookingRepository;
import uk.co.club.booking.domain.user.Role;
import uk.co.club.booking.domain.user.User;
import uk.co.club.booking.domain.user.UserRepository;

/**
 * The customer directory, for staff who are looking someone up.
 *
 * <p>Deliberately not {@code AdminUserService} with a role filter, even though both read the
 * same table. That service is the club's <em>account</em> screen — creating logins, granting
 * ADMIN, resetting other people's passwords — and it is ADMIN-only for that reason. This one is
 * reachable by STAFF, because "which bookings has this caller had" is the question the counter
 * asks all day. Sharing a service would mean either refusing staff the lookup they need, or
 * opening the account directory to everyone who works here.
 *
 * <p>Read-only, and only ever customers. {@link Role#CUSTOMER} is pinned in this class rather
 * than taken as a parameter: a role argument reaching here from a query string is how a staff
 * member ends up reading the admin list through a screen that was never meant to show it.
 */
@Service
public class AdminCustomerService {

    /** As {@code AdminUserService}: a bound on the response, not a promise about club size. */
    private static final int MAX_PAGE_SIZE = 100;

    private final UserRepository userRepository;
    private final BookingRepository bookingRepository;

    public AdminCustomerService(
            UserRepository userRepository, BookingRepository bookingRepository) {
        this.userRepository = userRepository;
        this.bookingRepository = bookingRepository;
    }

    /**
     * Customers, searched by name or email, newest account first.
     *
     * <p>Reuses {@code UserRepository.search}, so the wildcard escaping that protects the
     * account directory protects this too — a search for {@code %} matches the literal
     * character rather than every customer the club has.
     */
    @Transactional(readOnly = true)
    public Page<User> search(String search, int page, int size) {
        PageRequest pageRequest = PageRequest.of(
                Math.max(page, 0),
                Math.min(Math.max(size, 1), MAX_PAGE_SIZE),
                Sort.by(Sort.Order.asc("firstName"), Sort.Order.asc("lastName")));
        return userRepository.search(Role.CUSTOMER, searchPattern(search), pageRequest);
    }

    /**
     * How many bookings each of these customers has, in one query.
     *
     * <p>A count per row would be 25 extra queries on a full page. Absent ids mean zero — a
     * customer who has never booked has no rows to group, so the map simply has no entry.
     */
    @Transactional(readOnly = true)
    public Map<Long, Long> bookingCounts(List<User> customers) {
        if (customers.isEmpty()) {
            return Map.of();
        }
        List<Long> ids = customers.stream().map(User::getId).toList();
        return bookingRepository.countByUserIds(ids).stream()
                .collect(Collectors.toMap(row -> (Long) row[0], row -> (Long) row[1]));
    }

    /**
     * One customer.
     *
     * <p>Answers "not found" for a staff or admin id rather than "forbidden". The account
     * exists, but it is not a customer, and this screen's subject is customers — saying so
     * would confirm to whoever probed the id that there is an account there.
     */
    @Transactional(readOnly = true)
    public User require(long id) {
        return userRepository
                .findById(id)
                .filter(user -> user.getRole() == Role.CUSTOMER)
                .orElseThrow(() -> new NotFoundException(
                        ErrorCode.NOT_FOUND, "That customer does not exist."));
    }

    /** That customer's bookings, newest first — the reason staff opened the record. */
    @Transactional(readOnly = true)
    public List<Booking> bookingsFor(long customerId) {
        return bookingRepository.findByUserIdOrderByStartAtDesc(customerId);
    }

    /**
     * Escapes LIKE wildcards, exactly as {@code AdminUserService} and {@code AdminBookingQuery}
     * do. The backslash goes first, or it escapes the escapes added after it.
     */
    private String searchPattern(String search) {
        if (search == null || search.isBlank()) {
            return null;
        }
        String escaped = search.trim().toLowerCase()
                .replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_");
        return "%" + escaped + "%";
    }
}

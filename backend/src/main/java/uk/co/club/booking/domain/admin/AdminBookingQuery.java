package uk.co.club.booking.domain.admin;

import java.time.LocalDate;
import java.util.Collection;
import java.util.Set;
import uk.co.club.booking.domain.booking.BookingStatus;

/**
 * What the admin booking list is asking for. Every field optional.
 *
 * <p>Dates are club-local {@link LocalDate}, not instants: staff think in days, and converting a
 * day to the pair of instants that bound it is exactly the job {@code ClubClock} exists for. A
 * controller that accepted instants would push that conversion onto the browser, which does not
 * know the club's timezone.
 *
 * @param statuses empty means "any status" — an empty set must not mean "no results"
 * @param from inclusive, club-local
 * @param to inclusive, club-local (widened to the end of that day when resolved)
 * @param search matched against reference, customer name and email
 */
public record AdminBookingQuery(
        Set<BookingStatus> statuses,
        LocalDate from,
        LocalDate to,
        Long tableId,
        String search,
        int page,
        int size) {

    /** Beyond this a page is a denial-of-service dressed up as a query string. */
    public static final int MAX_PAGE_SIZE = 100;

    public AdminBookingQuery {
        statuses = statuses == null ? Set.of() : Set.copyOf(statuses);
        search = blankToNull(search);
        page = Math.max(page, 0);
        size = size <= 0 ? 25 : Math.min(size, MAX_PAGE_SIZE);
    }

    /** Null rather than an empty collection: the query's `IS NULL` guard is what disables it. */
    public Collection<BookingStatus> statusesOrNull() {
        return statuses.isEmpty() ? null : statuses;
    }

    /**
     * The search term as a LIKE pattern, lowercased.
     *
     * <p>Wildcards in the user's own input are escaped: without this, searching for the literal
     * string "%" matches every booking in the club, and "_" matches far more than it should.
     */
    public String searchPattern() {
        if (search == null) {
            return null;
        }
        String escaped = search.toLowerCase()
                .replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_");
        return "%" + escaped + "%";
    }

    private static String blankToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
